# SCHEMA-FROZEN-S5b-2 — apply + confirm-token (RL-4) + conflict serialization (RL-5), transition-only

> **FROZEN AT 2026-06-25T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for Phase 4 (implementation) AND the Phase 5.5 security checklist.
> This is the gold-path **apply** surface: the confirm-token (RL-4) and conflict
> serialization (RL-5) are the blast-radius controls. The token mint/verify
> algorithm, the RL-5 conflict-scan algorithm, the apply request/response contract,
> the firewall `framework_patch` allowlist entry, and the service-vs-firewall
> token-enforcement decision below are copy-ready and adversarially reviewed. Any
> deviation requires a new architect-review cycle, not an inline edit.
>
> Extends (does NOT re-cut) `SCHEMA-FROZEN-S5b-1.md` and `SCHEMA-FROZEN-S5a.md`.
> Reuses verbatim: `writeTriageRecord`, the `WRITE_CLASSES` data-driven table,
> `setFindingCell` / `setFrontmatterDecision` (§4/§5 S5b-1), the `ActionResult`
> sentinel pattern, the `:id` guard + route error mapping (§8 S5b-1), `TriageActionResponse`,
> `listTriageDocs`, `parseTriageDoc`, the `TriageDoc`/`TriageFinding` contract,
> `VaultUnreadableError`, the `ApiError` envelope.

## 0. Verification basis (GATE0, re-checked at freeze)

Validated against the shipped S5b-1/S5a source and the live store:

- `backend/src/repositories/writeFirewall.ts` ships the `WRITE_CLASSES` table but
  `writeTriageRecord` **hardcodes** `WRITE_CLASSES["triage_record"]` (line `const writeClass = WRITE_CLASSES["triage_record"]`).
  The `framework_patch` entry S5b-2 adds is therefore **inert at the write surface in
  this cut** (no code path reads it during apply) — exactly the transition-only intent.
  **Consequence (frozen below §6):** the firewall does NOT yet enforce
  `requiresConfirmToken`; the gate is **service-side**. The entry is added + unit-tested
  so the later content-apply story flips one dispatch line. This is recorded as
  IMPORTANT-resolved, not a hole, because no gold write path exists this cut.
- `packages/contracts/src/index.ts`: **`TriageFinding.id`, `.routing`, `.target_file`,
  `.status` are ALL `z.string().nullable()`** and `TriageDoc.decision` is
  `z.string().nullable()`. This nullability is the source of the two BLOCKER-class holes
  resolved in §1.5 and §2 below (scope binding on a null target; RL-5 self-exclusion when
  `F'.id` is null). The freeze pins explicit null-handling.
- `listTriageDocs({ vaultRoot })` returns `TriageDoc[]` and **swallows per-card parse
  errors** (logs to stderr, continues). RL-5 must tolerate a `findings: []` doc and never
  assume every sibling parsed.
- `triageActions.ts` reads via `fs.readFile(path.join(vaultRoot, TRIAGE_RECORD_DIR, id+".md"))`,
  `ENOENT → "NOT_FOUND"`, writes via `writeTriageRecord(triageDir, id+".md", newText)`,
  re-reads via `reReadCard`. `applyTriage` mirrors this exactly.
- `conventions`: `naming_language: english`, `null_syntax: "T | None"` (TS `T | null`),
  `multi_tenant: false` (no tenant column — N/A), `enums_for_states: true`
  (`RetroState` z.enum is the app-owned LL-008 exception), `orm: none` (no DB/migrations).

## 1. Confirm-token (RL-4) — module + algorithm (FROZEN)

`backend/src/services/confirmToken.ts` — Node `crypto` only, no external lib. The
**ONLY** module with in-memory mutable state in the backend (the per-process secret +
the used-token map). Documented for the Phase 5.5 reviewer.

### 1.1 Module-level singletons

```ts
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export const CONFIRM_TOKEN_TTL_MS = 120_000 as const;            // 2 min

// 32-byte secret, minted ONCE at module load. Never logged, never in .env,
// never in env vars, never in a response. Rotates on restart (acceptable: a
// restart mid-confirm just re-prompts — local single operator).
const CONFIRM_SECRET: Buffer = randomBytes(32);

// Replay defense. Key = the HMAC digest (hex) of a consumed token; value =
// issued_at, used ONLY to prune expired entries lazily. A Map (NOT a Set) so the
// set stays bounded by TTL × apply-rate. `markTokenUsed` is the ONLY writer.
const usedTokens = new Map<string, number>();   // hmacHex → issued_at
```

`TokenScope` (the signed, re-checked binding):

```ts
export interface TokenScope {
  id: string;          // card id (TriageDoc.id — always non-null)
  finding_id: string;  // finding id — MUST be non-null to mint/verify (see §1.5)
  target_file: string; // finding.target_file — MUST be non-null to mint/verify (§1.5)
}
```

### 1.2 Payload canonical form (FROZEN — exact bytes signed)

```ts
// issued_at is INSIDE the signed payload → an attacker cannot extend the TTL.
interface TokenPayload { id: string; finding_id: string; target_file: string; issued_at: number; }

// Canonical JSON: keys in THIS FIXED ORDER, no whitespace. Both mint and verify
// MUST build the payload object with this exact key order so JSON.stringify is
// byte-identical (verify re-serializes from the DECODED payload, never trusts the
// attacker's raw payload bytes — see §1.4 step 1).
function canonicalPayload(p: TokenPayload): string {
  return JSON.stringify({
    id: p.id,
    finding_id: p.finding_id,
    target_file: p.target_file,
    issued_at: p.issued_at,
  });
}
```

### 1.3 `mintConfirmToken` (FROZEN)

```ts
export function mintConfirmToken(scope: TokenScope, now: number = Date.now()): string {
  const payload: TokenPayload = { ...scope, issued_at: now };
  const json = canonicalPayload(payload);
  const sig  = createHmac("sha256", CONFIRM_SECRET).update(json).digest();       // Buffer
  return base64url(json) + "." + base64url(sig);
}
// base64url = Buffer.from(x).toString("base64url")  (Node ≥ 15 native).
```

The route also needs `issued_at + CONFIRM_TOKEN_TTL_MS` for the `expires_at` ISO string;
mint returns the token string only, so the route computes `expires_at` from the same
`now` it passes to `mintConfirmToken` (route owns `now`, passes it in — keeps mint pure).

### 1.4 `verifyConfirmToken` (FROZEN — exact order)

```ts
export type VerifyResult = "OK" | "INVALID" | "EXPIRED" | "USED" | "SCOPE_MISMATCH";

export function verifyConfirmToken(token: string, scope: TokenScope, now: number): VerifyResult {
  // ── 0. STRUCTURE ─────────────────────────────────────────────────────────
  // Split on the FIRST ".". Exactly two non-empty parts required. Any decode
  // throw is caught and collapsed to "INVALID" (never leaks a stack).
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return "INVALID";
  let payloadJson: string, sigBuf: Buffer, payload: TokenPayload;
  try {
    payloadJson = Buffer.from(token.slice(0, dot), "base64url").toString("utf-8");
    sigBuf      = Buffer.from(token.slice(dot + 1), "base64url");
    payload     = JSON.parse(payloadJson) as TokenPayload;
  } catch { return "INVALID"; }
  // Shape guard: the 4 fields present and correctly typed, else INVALID.
  if (typeof payload?.id !== "string" || typeof payload?.finding_id !== "string"
      || typeof payload?.target_file !== "string" || typeof payload?.issued_at !== "number") {
    return "INVALID";
  }

  // ── 1. SIGNATURE (recompute over the RE-SERIALIZED decoded payload) ───────
  // Re-serialize canonically from the PARSED payload — never HMAC the attacker's
  // raw bytes. This makes the signature bind the 4 typed fields, immune to
  // whitespace / key-reorder / extra-key tricks in the supplied payload segment.
  const expected = createHmac("sha256", CONFIRM_SECRET)
    .update(canonicalPayload(payload)).digest();                                 // Buffer
  // LENGTH GUARD FIRST — timingSafeEqual THROWS on unequal-length buffers.
  if (sigBuf.length !== expected.length) return "INVALID";
  if (!timingSafeEqual(sigBuf, expected)) return "INVALID";                      // constant-time

  // From here the token is authentic (signed by THIS process). hmacHex is the
  // canonical replay key.
  const hmacHex = expected.toString("hex");

  // ── 2. SCOPE BINDING (all three fields re-checked vs the LIVE request) ────
  // scope.{id,finding_id,target_file} are built by the service from the current
  // request + the FRESHLY RE-READ finding (§2 step list), not from the token.
  if (payload.id !== scope.id
      || payload.finding_id !== scope.finding_id
      || payload.target_file !== scope.target_file) {
    return "SCOPE_MISMATCH";
  }

  // ── 3. TTL (issued_at is inside the signed payload → cannot be extended) ──
  if (now - payload.issued_at > CONFIRM_TOKEN_TTL_MS) return "EXPIRED";

  // ── 4. REPLAY (consult the used-map AFTER auth+scope+ttl, BEFORE accept) ──
  if (usedTokens.has(hmacHex)) return "USED";

  return "OK";
}
```

**Order rationale (FROZEN): structure → signature(length-guard → timingSafeEqual) →
scope → TTL → used-set.** Signature precedes scope/TTL/used so an unauthentic token can
never probe the used-map or scope. The used-map is consulted LAST among the OK-gates so a
token that is scope-mismatched or expired is never reported as USED (cleaner errors; all
non-OK collapse to CONFIRM_REQUIRED at the service anyway).

### 1.5 Null-field guard (FROZEN — resolves the BLOCKER from nullable contract fields)

`TriageFinding.id`, `.routing`, `.target_file` are `z.string().nullable()`. A token whose
scope binds `target_file = null` (or `finding_id` derived from a null `#` cell) would
collapse the cross-target binding. **The service MUST reject a framework apply BEFORE
minting/verifying any token when the resolved finding's `id` or `target_file` is null/blank:**

- `applyTriage` requires `input.finding_id` to be a **non-empty string** (else `"BAD_REQUEST"`).
- After re-read, the resolved finding's `target_file` MUST be a **non-null, non-blank
  string** to be framework-applicable. If a framework-routed finding has `target_file == null`
  → `"BAD_REQUEST"` (detail `{ id }`) — a gold target with no file cannot be confirm-bound.
  (Project-routed apply with null target also → `"BAD_REQUEST"`: RL-5 keys on `target_file`,
  so a null target has no defined conflict scope either.)
- The `TokenScope` is built ONLY from non-null strings; `mintConfirmToken` / `verifyConfirmToken`
  never receive a null. This is enforced at the service, so `confirmToken.ts` may type
  `TokenScope` as all-`string` and assume non-null (the service is the gatekeeper).

### 1.6 `markTokenUsed` (FROZEN — mark-AFTER-successful-write)

```ts
export function markTokenUsed(hmacHex: string, issuedAt: number, now: number = Date.now()): void {
  // Lazy prune: drop any entry past TTL on every call → bounded by TTL × rate.
  for (const [k, ts] of usedTokens) {
    if (now - ts > CONFIRM_TOKEN_TTL_MS) usedTokens.delete(k);
  }
  usedTokens.set(hmacHex, issuedAt);
}
```

To call this the service needs the token's `hmacHex` + `issued_at`. Expose a tiny helper
so the service does not re-implement decode:

```ts
// Returns the replay key + issued_at for a token KNOWN to be OK (already verified).
// Pure decode + recompute; no side effects. Used by applyTriage right before markTokenUsed.
export function tokenReplayKey(token: string): { hmacHex: string; issued_at: number };
```

**Mark-timing (FROZEN):** `applyTriage` calls `markTokenUsed` **only AFTER**
`writeTriageRecord` resolves successfully (framework branch only). Rationale: if the write
THROWS (`WRITE_FAILED`), the card is byte-unchanged (S5b-1 atomic temp+rename) and the user
must be able to **retry with the same token** within the TTL — marking before the write
would lock out a legitimate retry of a transient disk failure. Replay is still defeated:
a *successful* apply marks the token, so a second *successful* apply attempt with the same
token returns `"USED"`. (A failed-then-retried apply is one logical apply, not a replay.)

> **Concurrency note (single-process, single operator):** Node is single-threaded;
> `applyTriage` is `async` but the verify→write→markUsed sequence has `await` points, so two
> overlapping requests with the SAME token could both pass `verifyConfirmToken` (neither has
> marked yet) before either writes. For a single local operator driving a 2-step modal this
> is not a realistic race, and the apply is idempotent (writing `"applied"` twice yields the
> same bytes — S5b-1 §4 idempotency). It is recorded as an accepted residual (SUGGESTION,
> not a blocker): if ever multi-client, move the mark to immediately-after-verify with a
> rollback-on-write-failure. **Frozen decision for S5b-2: mark-after-successful-write.**

### 1.7 Properties (Phase 5.5 security contract)

| Property | Mechanism (frozen) |
|----------|--------------------|
| Unforgeable | HMAC-SHA256 over a 32-byte per-process secret; signature recomputed over the **re-serialized decoded** payload; `timingSafeEqual` (length-guarded) — never string `===` |
| Scope-bound (non-transferable) | `{id, finding_id, target_file}` signed AND re-checked vs the live request + freshly re-read finding; any mismatch → `SCOPE_MISMATCH`; null target rejected pre-token (§1.5) |
| Single-use / no replay | `usedTokens` map consulted (step 4) BEFORE accept; `markTokenUsed` called AFTER successful write only; retry-after-failed-write allowed |
| Time-bounded | `issued_at` inside the signed payload (cannot be extended); `now - issued_at > 120_000` → `EXPIRED` |
| No write before confirm | the CONFIRM_REQUIRED path returns before any `writeTriageRecord`; verified by AC37 grep |
| Secret never leaks | in-memory only; `grep CONFIRM_SECRET` → `confirmToken.ts` HMAC call only, never a log/template/response |

## 2. RL-5 conflict serialization — scan algorithm (FROZEN)

Runs **inside `applyTriage`, on a freshly re-read store, AFTER the routing check and
BEFORE any token check or write** — never cached from route time. Closes the TOCTOU
window as much as a single-process app allows (re-read immediately before write; the only
residual gap is the async window in §1.6, accepted).

```
RL-5 SCAN (frozen):

INPUT:  this = { id: input.id, finding_id: input.finding_id,
                 target_file: <the re-read finding's target_file (non-null per §1.5)> }
        vaultRoot

1. const docs = await listTriageDocs({ vaultRoot });   // re-reads ALL cards from disk now.
                                                        // tolerates parse-skipped cards (findings: []).
2. for (const doc of docs)
     for (const F of doc.findings) {
       // (a) SAME TARGET — string-equal on the already-backtick-stripped value.
       if (F.target_file == null) continue;                 // null target never conflicts
       if (F.target_file !== this.target_file) continue;

       // (b) NOT SELF — exclude the exact finding being applied.
       //     GUARD the nullable F.id: a null-id sibling can NEVER be "self" because
       //     this.finding_id is a non-empty string (§1.5). Self requires BOTH equal.
       const isSelf = (doc.id === this.id) && (F.id != null) && (F.id === this.finding_id);
       if (isSelf) continue;

       // (c) CONFLICTING STATE — sibling already APPLIED the same target.
       const siblingApplied = (F.status === "applied") || (doc.decision === "applied");
       if (siblingApplied)
         return CONFLICT({ target_file: this.target_file,
                           conflicting_card: { id: doc.id, finding_id: F.id } });
     }
3. // no conflicting sibling → fall through to the token/write path.
```

**Conflicting-state set (FROZEN — micro-decision resolved):** a sibling conflicts iff
`F.status === "applied"` **OR** its parent `doc.decision === "applied"`. Non-conflicting
(do NOT block): `"deferred"`, `"rejected"`, `"pending"`, blank/`null`.

**Micro-decision — do `pending` siblings also conflict? → NO (resolved).** S5b-2 blocks
ONLY on an **already-`applied`** sibling — the genuine committed double-apply / lost-update
hazard. A `pending` (or routed-but-not-applied) sibling is not yet a committed conflict;
blocking on it would impose one-applier-per-target serialization that the rule does not
require for this cut. (S10 may widen this when the verification join lands; out of scope
here.) This matches the REQ §5 / story AC13 recommendation.

**Self-exclusion null guard (FROZEN — resolves the second BLOCKER-class hole):** because
`F.id` is nullable, `F.id === this.finding_id` alone is unsafe (`null === "P2"` is false,
fine; but a finding whose own `#` cell is blank could be mis-scanned). The frozen `isSelf`
predicate requires `F.id != null` before the equality, and requires `doc.id === this.id`,
so a null-id sibling is treated as a distinct finding (correct: it cannot be the one we are
applying, since we always apply a non-null `finding_id`).

**409 response shape (FROZEN):** `409`, code `CONFLICT`, `detail: { target_file,
conflicting_card: { id, finding_id } }` (first match). `finding_id` MAY be `null` if the
conflicting sibling's `#` cell is blank — that is acceptable in the detail (it is display
metadata, not a path; consistent with SEC5/SEC10: no absolute fs path leaked). No write.

## 3. `applyTriage` — service flow (FROZEN)

`backend/src/services/triageActions.ts`. Mirrors the S5b-1 `routeFinding` shape.

```ts
export interface ApplyInput {
  id: string;
  finding_id?: string | null;
  confirm_token?: string | null;
  vaultRoot?: string;            // defaults to env.vaultRoot, like the S5b-1 actions
}
// ActionResult extended additively:
export type ActionResult =
  TriageDoc | "NOT_FOUND" | "BAD_REQUEST" | "CONFIRM_REQUIRED" | "CONFLICT";
```

**Step order (FROZEN):**

```
applyTriage(input):
  vaultRoot = input.vaultRoot ?? env.vaultRoot
  triageDir = join(vaultRoot, TRIAGE_RECORD_DIR);  cardPath = join(triageDir, id + ".md")

  1. finding_id guard: if (!input.finding_id || input.finding_id.trim()==="") → "BAD_REQUEST"
     (card-level apply is 400 — apply is finding-scoped, mirrors S5b-1 route).
  2. raw = readCard(cardPath);  if raw === null (ENOENT) → "NOT_FOUND"
     (VaultUnreadableError on a dir error propagates uncaught → route 500.)
  3. parse: doc = { id, ...parseTriageDoc(raw) }; find F = doc.findings.find(f => f.id === input.finding_id)
     if (!F) → "NOT_FOUND"                                  // unknown finding_id
  4. routing = F.routing;  if (routing == null || routing.trim()==="") → "BAD_REQUEST"  // route before apply
     if (routing !== "framework" && routing !== "project") → "BAD_REQUEST"              // unknown routing token
  5. target = F.target_file; if (target == null || target.trim()==="") → "BAD_REQUEST"  // §1.5 null-target guard
  6. RL-5 SCAN (§2) on { id, finding_id, target_file: target }, vaultRoot.
       → if a conflicting sibling found → "CONFLICT"  (NO write)
  7. routing branch:
       project:   proceed to write (no token).
       framework: scope = { id, finding_id: input.finding_id, target_file: target }
                  vr = input.confirm_token ? verifyConfirmToken(input.confirm_token, scope, Date.now()) : "INVALID"
                  if (vr !== "OK") → "CONFIRM_REQUIRED"  (NO write; route mints a fresh token)
  8. WRITE (both branches, after all gates):
       newText = setFindingCell(raw, input.finding_id, 5, "applied")   // col [5] Status ← "applied"
       if (newText === raw) → "NOT_FOUND"   // belt-and-suspenders: setFindingCell no-op = unknown row
       await writeTriageRecord(triageDir, id + ".md", newText)         // WriteFirewallError propagates
  9. POST-WRITE (framework branch only): { hmacHex, issued_at } = tokenReplayKey(input.confirm_token!)
       markTokenUsed(hmacHex, issued_at)
  10. return reReadCard(vaultRoot, id)      // disk-truth TriageDoc (S5b-1 §6)
```

Notes pinned by the freeze:
- **NEVER `matter.stringify` (LL-013).** The write is `setFindingCell(raw, finding_id, 5, "applied")`
  only — a surgical raw-line edit (S5b-1 §4). The literal cell value is `"applied"` (plain,
  no bold). Card-level frontmatter `decision: applied` + `applied: true` is OUT this cut
  (apply is finding-scoped → `"BAD_REQUEST"` for a card-level apply; AC11). If a later cut
  re-enables card-level apply it uses `setFrontmatterDecision(raw, "applied", true)` (S5b-1 §5).
- `ApplyFailed` is **logic-only**, never persisted (the card is byte-unchanged on a failed
  write). It surfaces as the 500 `WRITE_FAILED` response (the route maps `WriteFirewallError`).
- **RL-6:** `applyTriage` contains NO `spawn` / `exec` / `execFile` / `mount`. Phase 5.5 grep
  `grep -rE "spawn|execFile|exec\b|mount" backend/src/services/triageActions.ts` → zero.
- **No gold content write:** `applyTriage` never references `agents/` and never calls a
  `writeFrameworkPatch` (none exists). Grep
  `grep -rn "writeFrameworkPatch\|agents/" backend/src/services/triageActions.ts` → zero.

## 4. Contract additions (FROZEN — `packages/contracts/src/index.ts`, additive only)

S5a/S5b-1 exports are NOT re-cut. `TriageFinding.{routing,target_file,status}` and
`TriageDoc.decision` stay `z.string().nullable()` (externally-owned vault vocab — LL-008).

```ts
// ---- S5b-2: RETRO apply (RL-4 confirm-token / RL-5 conflict) ----
// App-OWNED transition vocabulary → z.enum is the LL-008 EXCEPTION (precedent:
// DriftState / Governance / TriageRouting are already z.enum in this file).
export const RetroState = z.enum([
  "SinTriar", "Enrutado", "Aplicado", "Diferido", "Rechazado", "ApplyFailed",
]);
export type RetroState = z.infer<typeof RetroState>;

export const TriageApplyRequest = z.object({
  finding_id: z.string().optional(),     // present = finding-scoped (the supported path)
  confirm_token: z.string().optional(),  // required only for a framework-routed finding
});
export type TriageApplyRequest = z.infer<typeof TriageApplyRequest>;

export const TRIAGE_ERROR_CONFIRM_REQUIRED = "CONFIRM_REQUIRED" as const;
export const TRIAGE_ERROR_CONFLICT = "CONFLICT" as const;
```

- `RetroState` is used ONLY for service-layer transition logic; it does NOT retype any
  persisted field (AC24). `ApplyFailed` is logic-only (never written).
- All new exports at module top — no in-function imports (AC25/AC46; LL convention).
- `TriageApplyRequest` is permissive (extra keys ignored; matches S5b-1 posture). A
  card-level apply (`finding_id` absent) parses fine at zod but the SERVICE returns
  `"BAD_REQUEST"` (apply is finding-scoped — §3 step 1).

## 5. Route layer + error mapping (FROZEN — `backend/src/routes/triage.ts`)

Add `POST /triage/:id/apply` to `createTriageRouter`. Reuse the S5b-1 `:id` guard
(blank / `/` / `\` → 404) and the shared `WriteFirewallError` / `VaultUnreadableError`
catch block verbatim. New module-level constants (no magic strings):
`ERROR_CODE_CONFIRM_REQUIRED = "CONFIRM_REQUIRED" as const`,
`ERROR_CODE_CONFLICT = "CONFLICT" as const` (or import the contract constants
`TRIAGE_ERROR_CONFIRM_REQUIRED` / `TRIAGE_ERROR_CONFLICT`).

| Method | Path | Request | Success |
|--------|------|---------|---------|
| POST | `/triage/:id/apply` | `TriageApplyRequest` | 200 `TriageActionResponse` (re-read `TriageDoc`) |

**Sentinel / error → HTTP (FROZEN — extends S5b-1 §8 exactly):**

| From | HTTP | Code | Detail |
|------|------|------|--------|
| `:id` guard fail | 404 | `NOT_FOUND` | `{ id }` |
| zod `safeParse` fail | 400 | `BAD_REQUEST` | `{}` (do not echo body) |
| service `"CONFIRM_REQUIRED"` | 403 | `CONFIRM_REQUIRED` | `{ id, finding_id, target_file, confirm_token, expires_at }` |
| service `"CONFLICT"` | 409 | `CONFLICT` | `{ target_file, conflicting_card: { id, finding_id } }` |
| service `"NOT_FOUND"` | 404 | `NOT_FOUND` | `{ id }` |
| service `"BAD_REQUEST"` | 400 | `BAD_REQUEST` | `{ id }` |
| `WriteFirewallError PATH_FORBIDDEN` | 403 | `PATH_FORBIDDEN` | `{ id }` only (never abs path — SEC5/SEC10) |
| `WriteFirewallError WRITE_FAILED` | 500 | `WRITE_FAILED` | `{ id }` (= `ApplyFailed`) |
| `VaultUnreadableError` | 500 | `VAULT_UNREADABLE` | `{ path: err.vaultPath }` (reuse existing) |

**CONFIRM_REQUIRED detail minting (FROZEN):** when the service returns `"CONFIRM_REQUIRED"`,
the route re-derives the scope it needs (`id`, `finding_id`, and the finding's current
`target_file`) and mints a fresh token. To avoid a second disk read, **the service returns
the scope alongside the sentinel.** Frozen shape: the framework branch returns a small
typed object instead of the bare string when it needs the route to mint:

```ts
// The service returns this for the framework-no/invalid-token case so the route
// can mint with the exact re-read target_file (single source of truth, no re-read).
export interface ConfirmRequired {
  kind: "CONFIRM_REQUIRED";
  scope: { id: string; finding_id: string; target_file: string };
}
// ActionResult becomes:  TriageDoc | "NOT_FOUND" | "BAD_REQUEST" | ConfirmRequired
//                        | { kind: "CONFLICT"; detail: {...} }
```

Route then:
```ts
if (result.kind === "CONFIRM_REQUIRED") {
  const now = Date.now();
  const confirm_token = mintConfirmToken(result.scope, now);
  const expires_at = new Date(now + CONFIRM_TOKEN_TTL_MS).toISOString();
  res.status(403).json({ error: { code: ERROR_CODE_CONFIRM_REQUIRED,
    message: "Framework apply requires a confirm token.",
    detail: { ...result.scope, confirm_token, expires_at } } });
}
```

> **Implementer latitude (frozen as acceptable either way):** the string-sentinel style of
> S5b-1 (`ActionResult = TriageDoc | "..."`) MAY be kept by having the service mint nothing
> and the route re-read the finding to build the scope. The **discriminated-object** form
> above is RECOMMENDED because it (a) carries the exact re-read `target_file` (no second
> read, no TOCTOU between scan and mint) and (b) carries the CONFLICT detail without a
> magic-string round-trip. Pick ONE and keep it consistent. Either satisfies the security
> contract; the token is minted by the ROUTE in both.

## 6. Firewall `framework_patch` allowlist entry + token-enforcement decision (FROZEN)

`backend/src/repositories/writeFirewall.ts` — add the entry; extend the interface.

```ts
interface WriteClass {
  id: string;
  filenameRegex: RegExp;
  requiresConfirmToken?: boolean;   // NEW — optional; only framework_patch sets it
}

const WRITE_CLASSES: Record<string, WriteClass> = {
  triage_record: { id: "triage_record", filenameRegex: TRIAGE_FILENAME_REGEX },
  framework_patch: {                                  // NEW (gate-defining; write path RESERVED)
    id: "framework_patch",
    filenameRegex: /^[a-z0-9_-]+\.md$/,               // agents/<name>.md basename allowlist
    requiresConfirmToken: true,
  },
};
```

- **No `writeFrameworkPatch` function is exported or called in S5b-2.** `writeTriageRecord`
  remains hardcoded to `WRITE_CLASSES["triage_record"]`; the `framework_patch` entry is
  inert at the write surface this cut (verified §0). It is unit-tested for its shape
  (`requiresConfirmToken === true`, the basename regex accepts `pattern-detector.md`,
  rejects `../x.md` / uppercase / separators) so the later content-apply story flips one
  dispatch line with no re-cut.

**Service-vs-firewall token enforcement — DECISION (FROZEN):** **the confirm-token gate is
SERVICE-side for S5b-2** (`applyTriage` step 7). The firewall does NOT verify the token in
this cut because the apply never invokes the `framework_patch` write path — the only write
is `triage_record`, which (correctly) needs no token. The `requiresConfirmToken: true`
metadata is the **declarative contract** the later content-apply story will read:

> **Defense-in-depth requirement reserved for the content-apply story (NOT this cut):**
> when `writeFrameworkPatch` is added, the firewall MUST itself REFUSE a `framework_patch`
> write that arrives without a verified-token assertion (e.g. a `tokenVerified: true`
> argument the service can only set after `verifyConfirmToken === "OK"`), so a gold write
> can never reach disk on the service's word alone. For S5b-2 there is no such path, so the
> defense-in-depth check is **declared (the entry exists, `requiresConfirmToken: true`) but
> not yet exercised** — recorded so Phase 5.5 confirms the gate is service-enforced AND the
> firewall metadata is in place for the next cut. This is the resolved micro-decision: the
> REQ's "service-side gate + firewall allowlist entry" is correct for transition-only; the
> firewall's active refusal is the next story's BLOCKER, not this one's.

## 7. RetroState reconciliation (FROZEN)

Two vocabularies, reconciled per REQ §7:
- **Persisted/display** stays permissive `z.string().nullable()` (LL-008): apply writes the
  plain literal `"applied"` into table col `[5]` `Status` (round-trips through the S5a parser).
- **Transition logic** uses the app-owned `RetroState` z.enum (LL-008 exception). The service
  may compute a `RetroState` for its branching but **persists strings**. `Aplicado` ⇒ writes
  `status: applied`. `ApplyFailed` is logic-only (never persisted; 500 `WRITE_FAILED`). The
  disk encoding is the source of truth on re-read.

## 8. Smoke / test safety (FROZEN — extends S5b-1 §10)

- EVERY write test injects a TEMP vault (`fs.mkdtemp` + `fs.cp` of a fixture); inject via
  `createApp({ vaultRoot: tmpDir })` / `createTriageRouter({ vaultRoot: tmpDir })`. NEVER
  reference `process.env.KURAKA_VAULT`. Teardown `fs.rm(tmpDir, { recursive:true, force:true })`.
- **Framework round-trip (Phase 6.8):** POST apply (no token) → 403 + `detail.confirm_token`
  present → re-POST with that token → 200 + temp card col `[5]` on disk === `"applied"` →
  replay the SAME token → 403 (`USED`). Real vault never referenced.
- **RL-5:** seed two cards sharing one `target_file`, card A `status: applied`; POST apply
  on card B → 409, `detail.conflicting_card.id === cardA.id`; card B byte-unchanged.
  Also assert a `deferred`/`rejected`/`pending` sibling does NOT block (negative case).
- **Token unit tests:** tampered sig → `INVALID`; unequal-length sig buffer → `INVALID`
  (length guard, no throw); scope mismatch (each of id/finding_id/target_file) → `SCOPE_MISMATCH`;
  expired (`now - issued_at > TTL`) → `EXPIRED`; replay (after `markTokenUsed`) → `USED`;
  valid → `OK`; retry-after-failed-write (token NOT marked) → still `OK`. Assert
  `CONFIRM_SECRET` never appears in any thrown message / return value.
- **Null-field guards:** framework finding with `target_file == null` → `BAD_REQUEST`
  (no token minted); RL-5 self-exclusion with a null-`#` sibling row does not crash.
- **RL-6:** `grep -rE "spawn|execFile|exec\b|mount" backend/src/services/triageActions.ts` → 0.
- **No gold write:** `grep -rn "writeFrameworkPatch\|agents/" backend/src/services/triageActions.ts` → 0.
- **Single-writer invariant:**
  `grep -rE "fs\.(writeFile|rename|mkdir|rm)" backend/src --include="*.ts" --exclude="*.test.ts"`
  → `writeFirewall.ts` only.
- **Secret-not-logged:**
  `grep -rn "CONFIRM_SECRET" backend/src --include="*.ts" --exclude="*.test.ts"` → only
  `confirmToken.ts`, only in the `createHmac` call.

## 9. Scope boundary (FROZEN — what S5b-2 must NOT do)

NO `agents/*.md` content write (no `writeFrameworkPatch`). NO `project_patch` content write.
NO mount / fan-out (RL-3). NO verification join (RL-1/RL-2, K=2 close) or downstream states
(`Sincronizado`, `Verificado`, `Regresado`, `Supersedido`, `ParcialmenteSincronizado`,
`Revertido`) — S10. NO RL-7 dedup. NO card-level "apply all". The firewall's
`framework_patch` entry is declared (gate metadata) but its write path is reserved.

---

**FROZEN AT 2026-06-25T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
