/**
 * Confirm-token — RL-4 human-in-the-loop gate for framework-routed triage applies.
 *
 * This is the ONLY module in the backend with module-level in-memory mutable state:
 *   - CONFIRM_SECRET: a 32-byte per-process secret (randomBytes at load). NEVER logged,
 *     NEVER in env vars, NEVER in any response. Rotates on restart (acceptable: local
 *     single operator; a restart mid-confirm merely re-prompts).
 *   - usedTokens: replay-defense map of consumed token HMAC hex → issued_at.
 *
 * Algorithm (SCHEMA-FROZEN-S5b-2 §1):
 *   Token format:  base64url(payloadJson) + "." + base64url(HMAC_SHA256(secret, canonicalPayload))
 *   Canonical payload: JSON.stringify({ id, finding_id, target_file, issued_at }) — keys in EXACT
 *     fixed order, no whitespace. Both mint and verify build from the SAME key order.
 *   Verify order (FROZEN): structure → signature (length-guard THEN timingSafeEqual) →
 *     scope → TTL → used-map.
 *
 * No external npm dep — Node `node:crypto` only.
 *
 * Documented for Phase 5.5 reviewer (security contract in SCHEMA-FROZEN-S5b-2 §1.7).
 */
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

// ── Module-level singletons ───────────────────────────────────────────────────

export const CONFIRM_TOKEN_TTL_MS = 120_000 as const; // 2 minutes

/**
 * 32-byte secret, generated ONCE at module load. Never logged, never in .env,
 * never in environment variables, never in a response.
 * Rotates on process restart — acceptable for a single local operator.
 */
const CONFIRM_SECRET: Buffer = randomBytes(32);

/**
 * Replay defense. Key = HMAC digest hex of a consumed token; value = issued_at,
 * used ONLY to prune expired entries lazily. `markTokenUsed` is the ONLY writer.
 * A Map (not a Set) so we can prune expired entries by TTL × apply-rate.
 */
const usedTokens = new Map<string, number>(); // hmacHex → issued_at

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The signed binding for a specific card + finding + target_file combination.
 * ALL fields are non-null strings — the service is the gatekeeper (§1.5).
 */
export interface TokenScope {
  id: string;           // card id (TriageDoc.id — always non-null)
  finding_id: string;   // finding id — MUST be non-null at mint/verify call site
  target_file: string;  // finding.target_file — MUST be non-null at mint/verify call site
}

/** Result of verifyConfirmToken. All non-OK values collapse to CONFIRM_REQUIRED at the service. */
export type VerifyResult = "OK" | "INVALID" | "EXPIRED" | "USED" | "SCOPE_MISMATCH";

// ── Internal types (not exported) ─────────────────────────────────────────────

interface TokenPayload {
  id: string;
  finding_id: string;
  target_file: string;
  issued_at: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Canonical JSON: keys in THIS FIXED ORDER, no whitespace.
 * Both mint and verify MUST call this so JSON.stringify is byte-identical.
 * Verify re-serializes from the DECODED payload (never trusts the attacker's raw bytes).
 */
function canonicalPayload(p: TokenPayload): string {
  return JSON.stringify({
    id: p.id,
    finding_id: p.finding_id,
    target_file: p.target_file,
    issued_at: p.issued_at,
  });
}

/** base64url encode: Node ≥ 15 native Buffer.toString("base64url"). */
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mint a confirm token for the given scope.
 *
 * @param scope    { id, finding_id, target_file } — all non-null (service-enforced §1.5).
 * @param now      current timestamp in ms (injectable for testing; defaults to Date.now()).
 * @returns        opaque token string: base64url(payload) + "." + base64url(hmac).
 *
 * The route passes its own `now` so it can compute `expires_at = now + TTL` without a
 * second clock read (SCHEMA-FROZEN-S5b-2 §1.3).
 */
export function mintConfirmToken(scope: TokenScope, now: number = Date.now()): string {
  const payload: TokenPayload = { ...scope, issued_at: now };
  const json = canonicalPayload(payload);
  const sig = createHmac("sha256", CONFIRM_SECRET).update(json).digest(); // Buffer
  return base64url(json) + "." + base64url(sig);
}

/**
 * Verify a confirm token against the live request scope and current time.
 *
 * Verify order (FROZEN — §1.4):
 *   0. STRUCTURE: split on first "."; decode both parts; parse payload; shape-guard 4 fields.
 *   1. SIGNATURE: recompute HMAC over the re-serialized decoded payload (NOT the attacker's
 *      raw bytes); LENGTH GUARD before timingSafeEqual (throws on unequal lengths).
 *   2. SCOPE: all three fields re-checked vs the live request + freshly re-read finding.
 *   3. TTL: now - issued_at > CONFIRM_TOKEN_TTL_MS → EXPIRED.
 *   4. USED: hmacHex in usedTokens → USED.
 *
 * @param token   the token string to verify.
 * @param scope   { id, finding_id, target_file } from the current request + re-read finding.
 * @param now     current timestamp in ms (injectable for testing).
 */
export function verifyConfirmToken(token: string, scope: TokenScope, now: number): VerifyResult {
  // ── 0. STRUCTURE ─────────────────────────────────────────────────────────────
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return "INVALID";

  let payloadJson: string;
  let sigBuf: Buffer;
  let payload: TokenPayload;

  try {
    payloadJson = Buffer.from(token.slice(0, dot), "base64url").toString("utf-8");
    sigBuf = Buffer.from(token.slice(dot + 1), "base64url");
    payload = JSON.parse(payloadJson) as TokenPayload;
  } catch {
    return "INVALID";
  }

  // Shape guard: the 4 fields must be present and correctly typed.
  if (
    typeof payload?.id !== "string" ||
    typeof payload?.finding_id !== "string" ||
    typeof payload?.target_file !== "string" ||
    typeof payload?.issued_at !== "number"
  ) {
    return "INVALID";
  }

  // ── 1. SIGNATURE (recompute over RE-SERIALIZED decoded payload) ───────────────
  // Re-serialize canonically from the PARSED payload — never HMAC the attacker's
  // raw bytes. Makes the signature immune to whitespace / key-reorder / extra-key tricks.
  const expected = createHmac("sha256", CONFIRM_SECRET)
    .update(canonicalPayload(payload))
    .digest(); // Buffer

  // LENGTH GUARD FIRST — timingSafeEqual THROWS on unequal-length Buffers.
  if (sigBuf.length !== expected.length) return "INVALID";
  if (!timingSafeEqual(sigBuf, expected)) return "INVALID"; // constant-time comparison

  // From here the token is authentic (signed by THIS process).
  const hmacHex = expected.toString("hex");

  // ── 2. SCOPE BINDING ──────────────────────────────────────────────────────────
  // Re-check against the live request scope — the service builds this from the
  // current request + freshly re-read finding (never from the token itself).
  if (
    payload.id !== scope.id ||
    payload.finding_id !== scope.finding_id ||
    payload.target_file !== scope.target_file
  ) {
    return "SCOPE_MISMATCH";
  }

  // ── 3. TTL (issued_at is inside the signed payload → cannot be extended) ──────
  if (now - payload.issued_at > CONFIRM_TOKEN_TTL_MS) return "EXPIRED";

  // ── 4. REPLAY (consult the used-map AFTER auth+scope+TTL, BEFORE accept) ──────
  // Signature precedes scope/TTL/used so an unauthentic token can never probe the map.
  if (usedTokens.has(hmacHex)) return "USED";

  return "OK";
}

/**
 * Mark a token as used AFTER a successful write (SCHEMA-FROZEN-S5b-2 §1.6).
 *
 * MUST be called with the hmacHex from tokenReplayKey ONLY after writeTriageRecord
 * resolves successfully. If the write throws, do NOT call this — the caller must be
 * able to retry with the same token (transient disk failure is not a replay).
 *
 * Prunes expired entries lazily on each call to keep the map bounded.
 *
 * @param hmacHex  canonical replay key (HMAC digest hex) from tokenReplayKey.
 * @param issuedAt issued_at from the token payload (for lazy pruning).
 * @param now      current timestamp in ms (injectable for testing; defaults to Date.now()).
 */
export function markTokenUsed(hmacHex: string, issuedAt: number, now: number = Date.now()): void {
  // Lazy prune: drop any entry past TTL on every call → bounded by TTL × apply-rate.
  for (const [k, ts] of usedTokens) {
    if (now - ts > CONFIRM_TOKEN_TTL_MS) usedTokens.delete(k);
  }
  usedTokens.set(hmacHex, issuedAt);
}

/**
 * Decode a token KNOWN to be OK (already verified) and return the replay key + issued_at.
 * Pure decode + HMAC recompute; no side effects.
 *
 * Called by applyTriage immediately before markTokenUsed to supply the correct arguments
 * without re-implementing the decode logic in the service.
 *
 * Precondition: verifyConfirmToken must have returned "OK" for this token immediately
 * prior to this call (same request, same process). If called on an invalid token the
 * result is undefined behavior — do NOT call on untrusted input.
 */
export function tokenReplayKey(token: string): { hmacHex: string; issued_at: number } {
  const dot = token.indexOf(".");
  const payloadJson = Buffer.from(token.slice(0, dot), "base64url").toString("utf-8");
  const payload = JSON.parse(payloadJson) as TokenPayload;
  const hmac = createHmac("sha256", CONFIRM_SECRET)
    .update(canonicalPayload(payload))
    .digest();
  return { hmacHex: hmac.toString("hex"), issued_at: payload.issued_at };
}
