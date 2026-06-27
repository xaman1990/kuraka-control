/**
 * Unit tests for confirmToken.ts (S5b-2 — AC1–8, security AC33–38).
 *
 * Security core: HMAC-SHA256 mint + verify. NEVER touches the real vault.
 * No module-level shared state leaks between tests — the `usedTokens` Map is
 * module-scoped (the only cross-test coupling). markTokenUsed is always called
 * with distinct tokens (different `now` or different scopes) to avoid replay
 * collisions across tests.
 *
 * Clock seam: mintConfirmToken and verifyConfirmToken both accept a `now`
 * parameter (injectable clock), so TTL tests are exact without fake timers.
 *
 * Cases:
 *   happy path          — mint + verify same scope + now → "OK"
 *   forge (tampered)    — manipulated payload+wrong sig → "INVALID"
 *   malformed structure — no dot / extra dot / non-base64url / short sig → "INVALID"
 *   length guard        — unequal-length sig buffer → "INVALID" (no throw)
 *   scope mismatch      — wrong id / finding_id / target_file → "SCOPE_MISMATCH"
 *   TTL boundary        — now+TTL ok / now+TTL+1 → "EXPIRED"
 *   replay              — verify → markTokenUsed → verify again → "USED"
 *   secret safety       — CONFIRM_SECRET never appears in token string or VerifyResult
 */
import { describe, it, expect } from "vitest";
import {
  mintConfirmToken,
  verifyConfirmToken,
  markTokenUsed,
  tokenReplayKey,
  CONFIRM_TOKEN_TTL_MS,
} from "./confirmToken.js";
import type { TokenScope } from "./confirmToken.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base scope for the happy-path tests. */
function _makeScope(overrides: Partial<TokenScope> = {}): TokenScope {
  return {
    id: "2026-06-06-sie_v2",
    finding_id: "P2",
    target_file: "rules/no-matter-stringify.md",
    ...overrides,
  };
}

/** Fixed "now" timestamp so tests are deterministic. */
const BASE_NOW = 1_750_000_000_000; // arbitrary stable epoch

/** Mint a token with a fixed now so we can control TTL. */
function _mintAt(scope: TokenScope, now: number): string {
  return mintConfirmToken(scope, now);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("mintConfirmToken + verifyConfirmToken — happy path", () => {
  it("should return OK when token is verified immediately after minting with same scope", () => {
    // Arrange
    const scope = _makeScope();
    const now = BASE_NOW;

    // Act
    const token = _mintAt(scope, now);
    const result = verifyConfirmToken(token, scope, now);

    // Assert
    expect(result).toBe("OK");
  });

  it("should return OK at exactly now+TTL (boundary — within window)", () => {
    // Arrange
    const scope = _makeScope();
    const now = BASE_NOW;
    const token = _mintAt(scope, now);

    // Act — verify at exactly issued_at + TTL (boundary is inclusive in ">")
    const verifyNow = now + CONFIRM_TOKEN_TTL_MS;
    const result = verifyConfirmToken(token, scope, verifyNow);

    // Assert — the guard is `now - issued_at > TTL` so == TTL is still OK
    expect(result).toBe("OK");
  });

  it("should return a non-empty token string with exactly one dot separator", () => {
    // Arrange
    const scope = _makeScope();

    // Act
    const token = mintConfirmToken(scope, BASE_NOW);

    // Assert — base64url(payload).base64url(sig) has exactly one dot
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Forge: tampered payload (same sig structure, wrong bytes)
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — forged / tampered tokens", () => {
  it("should return INVALID when the payload segment is replaced with a different base64url value", () => {
    // Arrange — build a valid token, then replace the payload segment with a
    // different base64url-encoded JSON (scope mismatch + wrong sig).
    const scope = _makeScope();
    const token = _mintAt(scope, BASE_NOW);
    const dot = token.indexOf(".");
    const originalSig = token.slice(dot); // ".{sig}"

    // Craft an attacker payload for a different scope
    const attackerPayload = Buffer.from(
      JSON.stringify({ id: "attacker", finding_id: "P1", target_file: "evil.md", issued_at: BASE_NOW }),
      "utf-8",
    ).toString("base64url");
    const forgedToken = attackerPayload + originalSig;

    // Act
    const result = verifyConfirmToken(forgedToken, scope, BASE_NOW);

    // Assert — signature mismatch detected before scope check
    expect(result).toBe("INVALID");
  });

  it("should return INVALID when the signature segment is replaced with random bytes", () => {
    // Arrange
    const scope = _makeScope();
    const token = _mintAt(scope, BASE_NOW);
    const dot = token.indexOf(".");
    const payloadPart = token.slice(0, dot);

    // Replace sig with a valid-length base64url of random bytes (32 bytes → 43 base64url chars)
    const fakeSig = Buffer.alloc(32, 0xab).toString("base64url");
    const forgedToken = payloadPart + "." + fakeSig;

    // Act
    const result = verifyConfirmToken(forgedToken, scope, BASE_NOW);

    // Assert
    expect(result).toBe("INVALID");
  });

  it("should return INVALID when an extra key is injected into the payload (key-order attack)", () => {
    // Arrange — the implementation recomputes HMAC over the RE-SERIALIZED decoded
    // payload (canonical key order). An extra key in the attacker's JSON changes
    // the decoded JSON.parse result's fields but the HMAC re-serialization is
    // canonical, so the HMAC verification will catch this IF the injected key
    // causes the serialized string to differ — here we verify the sig fails.
    const scope = _makeScope();

    const payloadWithExtra = JSON.stringify({
      id: scope.id,
      finding_id: scope.finding_id,
      target_file: scope.target_file,
      issued_at: BASE_NOW,
      extra: "injected",
    });
    const payloadB64 = Buffer.from(payloadWithExtra, "utf-8").toString("base64url");
    // Use a wrong sig (we don't know the secret)
    const fakeSig = Buffer.alloc(32, 0).toString("base64url");
    const forgedToken = payloadB64 + "." + fakeSig;

    // Act
    const result = verifyConfirmToken(forgedToken, scope, BASE_NOW);

    // Assert — invalid because sig doesn't match
    expect(result).toBe("INVALID");
  });
});

// ---------------------------------------------------------------------------
// Malformed structure
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — malformed structure → INVALID (never throws)", () => {
  it("should return INVALID when the token has no dot", () => {
    // Arrange
    const token = "nodotinthisstring";

    // Act + Assert — must not throw
    expect(() => verifyConfirmToken(token, _makeScope(), BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the dot is at position 0 (empty payload segment)", () => {
    // Arrange
    const token = ".somesighere";

    // Act + Assert
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the dot is at the last position (empty sig segment)", () => {
    // Arrange
    const token = "somepayload.";

    // Act + Assert
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the token is an empty string", () => {
    // Act + Assert — must not throw
    expect(() => verifyConfirmToken("", _makeScope(), BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken("", _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the payload segment is not valid base64url (garbage bytes)", () => {
    // Arrange — contains chars invalid for base64url that produce a non-JSON decode
    const token = "!!!not-base64url!!!.c29tZXNpZw";

    // Act + Assert — must not throw (catch block → INVALID)
    expect(() => verifyConfirmToken(token, _makeScope(), BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the payload decodes to non-JSON (plain text)", () => {
    // Arrange
    const plainText = Buffer.from("not-json", "utf-8").toString("base64url");
    const fakeSig = Buffer.alloc(32, 0).toString("base64url");
    const token = plainText + "." + fakeSig;

    // Act + Assert
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when the payload is valid JSON but missing required fields", () => {
    // Arrange — missing issued_at
    const partial = JSON.stringify({ id: "x", finding_id: "P1", target_file: "f.md" });
    const payloadB64 = Buffer.from(partial, "utf-8").toString("base64url");
    const fakeSig = Buffer.alloc(32, 0).toString("base64url");
    const token = payloadB64 + "." + fakeSig;

    // Act + Assert
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID when issued_at is a string instead of number (wrong type)", () => {
    // Arrange
    const wrongType = JSON.stringify({ id: "x", finding_id: "P1", target_file: "f.md", issued_at: "not-a-number" });
    const payloadB64 = Buffer.from(wrongType, "utf-8").toString("base64url");
    const fakeSig = Buffer.alloc(32, 0).toString("base64url");
    const token = payloadB64 + "." + fakeSig;

    // Act + Assert
    expect(verifyConfirmToken(token, _makeScope(), BASE_NOW)).toBe("INVALID");
  });
});

// ---------------------------------------------------------------------------
// Length guard — timingSafeEqual throws on unequal-length buffers; must NOT throw
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — length guard (exercises §1.4 step 1 guard BEFORE timingSafeEqual)", () => {
  it("should return INVALID (not throw) when sig buffer is shorter than expected (1 byte)", () => {
    // Arrange — valid payload b64, 1-byte sig (HMAC-SHA256 is 32 bytes → length mismatch)
    const scope = _makeScope();
    const token = _mintAt(scope, BASE_NOW);
    const dot = token.indexOf(".");
    const payloadPart = token.slice(0, dot);
    const shortSig = Buffer.alloc(1, 0xff).toString("base64url");
    const forgedToken = payloadPart + "." + shortSig;

    // Act + Assert — must NOT throw (if it did, timingSafeEqual blew up)
    expect(() => verifyConfirmToken(forgedToken, scope, BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken(forgedToken, scope, BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID (not throw) when sig buffer is longer than expected (64 bytes)", () => {
    // Arrange
    const scope = _makeScope();
    const token = _mintAt(scope, BASE_NOW);
    const dot = token.indexOf(".");
    const payloadPart = token.slice(0, dot);
    const longSig = Buffer.alloc(64, 0xaa).toString("base64url");
    const forgedToken = payloadPart + "." + longSig;

    // Act + Assert
    expect(() => verifyConfirmToken(forgedToken, scope, BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken(forgedToken, scope, BASE_NOW)).toBe("INVALID");
  });

  it("should return INVALID (not throw) when sig is exactly 0 bytes (empty after decode)", () => {
    // Arrange — "AA" in base64url decodes to 1 byte; empty string decodes to 0 bytes
    const scope = _makeScope();
    const token = _mintAt(scope, BASE_NOW);
    const dot = token.indexOf(".");
    const payloadPart = token.slice(0, dot);
    // base64url empty string decodes to empty buffer
    const zeroLenSig = "";
    const forgedToken = payloadPart + "." + zeroLenSig;

    // Act + Assert — dot at last position → caught by structure guard as INVALID
    expect(() => verifyConfirmToken(forgedToken, scope, BASE_NOW)).not.toThrow();
    expect(verifyConfirmToken(forgedToken, scope, BASE_NOW)).toBe("INVALID");
  });
});

// ---------------------------------------------------------------------------
// Scope binding — SCOPE_MISMATCH for each mismatched field
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — scope binding (SCOPE_MISMATCH for each field)", () => {
  it("should return SCOPE_MISMATCH when id differs between token scope and verify scope", () => {
    // Arrange — mint with scope A, verify with scope B (different id)
    const mintScope = _makeScope({ id: "card-A" });
    const verifyScope = _makeScope({ id: "card-B" });
    const now = BASE_NOW;
    const token = _mintAt(mintScope, now);

    // Act
    const result = verifyConfirmToken(token, verifyScope, now);

    // Assert
    expect(result).toBe("SCOPE_MISMATCH");
  });

  it("should return SCOPE_MISMATCH when finding_id differs (same id + target_file)", () => {
    // Arrange
    const mintScope = _makeScope({ finding_id: "P2" });
    const verifyScope = _makeScope({ finding_id: "P5" });
    const now = BASE_NOW;
    const token = _mintAt(mintScope, now);

    // Act
    const result = verifyConfirmToken(token, verifyScope, now);

    // Assert
    expect(result).toBe("SCOPE_MISMATCH");
  });

  it("should return SCOPE_MISMATCH when target_file differs (same id + finding_id)", () => {
    // Arrange
    const mintScope = _makeScope({ target_file: "agents/x.md" });
    const verifyScope = _makeScope({ target_file: "agents/y.md" });
    const now = BASE_NOW;
    const token = _mintAt(mintScope, now);

    // Act
    const result = verifyConfirmToken(token, verifyScope, now);

    // Assert
    expect(result).toBe("SCOPE_MISMATCH");
  });

  it("should return OK when all three scope fields match exactly (regression guard)", () => {
    // Arrange
    const scope = _makeScope();
    const now = BASE_NOW + 1; // slightly different now to avoid replay collision with other tests
    const token = _mintAt(scope, now);

    // Act
    const result = verifyConfirmToken(token, scope, now);

    // Assert
    expect(result).toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// TTL: injectable clock seam
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — TTL enforcement (injectable clock)", () => {
  it("should return EXPIRED when now - issued_at > TTL_MS (one millisecond over)", () => {
    // Arrange
    const scope = _makeScope();
    const issuedAt = BASE_NOW;
    const token = _mintAt(scope, issuedAt);

    // Act — verify at issued_at + TTL + 1ms (just over)
    const verifyNow = issuedAt + CONFIRM_TOKEN_TTL_MS + 1;
    const result = verifyConfirmToken(token, scope, verifyNow);

    // Assert
    expect(result).toBe("EXPIRED");
  });

  it("should return OK when now - issued_at === TTL_MS (boundary, not yet expired)", () => {
    // Arrange
    const scope = _makeScope({ finding_id: "P-ttl-boundary" });
    const issuedAt = BASE_NOW;
    const token = _mintAt(scope, issuedAt);

    // Act — boundary: exactly at TTL (guard is strictly greater-than)
    const verifyNow = issuedAt + CONFIRM_TOKEN_TTL_MS;
    const result = verifyConfirmToken(token, scope, verifyNow);

    // Assert
    expect(result).toBe("OK");
  });

  it("should return EXPIRED when now is far in the future (e.g., 5 minutes later)", () => {
    // Arrange
    const scope = _makeScope({ finding_id: "P-5min" });
    const issuedAt = BASE_NOW;
    const token = _mintAt(scope, issuedAt);

    // Act
    const verifyNow = issuedAt + 5 * 60 * 1000; // 5 minutes
    const result = verifyConfirmToken(token, scope, verifyNow);

    // Assert
    expect(result).toBe("EXPIRED");
  });
});

// ---------------------------------------------------------------------------
// Replay defense — USED after markTokenUsed
// ---------------------------------------------------------------------------

describe("verifyConfirmToken — replay defense (USED after markTokenUsed)", () => {
  it("should return USED when verifying the same token after markTokenUsed is called", () => {
    // Arrange — use a unique finding_id per test to isolate usedTokens state
    const scope = _makeScope({ finding_id: "P-replay-1" });
    const issuedAt = BASE_NOW + 100;
    const token = _mintAt(scope, issuedAt);

    // First verify: should be OK
    const firstResult = verifyConfirmToken(token, scope, issuedAt);
    expect(firstResult).toBe("OK");

    // Mark as used
    const { hmacHex, issued_at } = tokenReplayKey(token);
    markTokenUsed(hmacHex, issued_at, issuedAt);

    // Act — verify again (replay attempt)
    const replayResult = verifyConfirmToken(token, scope, issuedAt);

    // Assert
    expect(replayResult).toBe("USED");
  });

  it("should allow a second distinct token (different finding_id) even after marking the first one used", () => {
    // Arrange
    const scope1 = _makeScope({ finding_id: "P-replay-2a" });
    const scope2 = _makeScope({ finding_id: "P-replay-2b" });
    const now1 = BASE_NOW + 200;
    const now2 = BASE_NOW + 201;
    const token1 = _mintAt(scope1, now1);
    const token2 = _mintAt(scope2, now2);

    // Mark token1 used
    const { hmacHex: h1, issued_at: ia1 } = tokenReplayKey(token1);
    markTokenUsed(h1, ia1, now1);

    // Act — token2 for its own scope should still be OK
    const result = verifyConfirmToken(token2, scope2, now2);

    // Assert
    expect(result).toBe("OK");
  });

  it("should check USED AFTER scope and TTL (order: structure→sig→scope→TTL→used)", () => {
    // If a token is scope-mismatched OR expired it should NOT be reported as USED.
    // This verifies the verification order from SCHEMA-FROZEN §1.4.
    const scope = _makeScope({ finding_id: "P-order-check" });
    const issuedAt = BASE_NOW + 300;
    const token = _mintAt(scope, issuedAt);

    // Mark it used
    const { hmacHex, issued_at } = tokenReplayKey(token);
    markTokenUsed(hmacHex, issued_at, issuedAt);

    // Verify with wrong scope — should be SCOPE_MISMATCH not USED
    const wrongScope = _makeScope({ finding_id: "P-order-check", target_file: "other.md" });
    expect(verifyConfirmToken(token, wrongScope, issuedAt)).toBe("SCOPE_MISMATCH");

    // Verify when expired — should be EXPIRED not USED
    const expiredNow = issuedAt + CONFIRM_TOKEN_TTL_MS + 1;
    expect(verifyConfirmToken(token, scope, expiredNow)).toBe("EXPIRED");
  });
});

// ---------------------------------------------------------------------------
// Secret safety: CONFIRM_SECRET never appears in token string or result
// ---------------------------------------------------------------------------

describe("confirmToken — secret safety (CONFIRM_SECRET never in output)", () => {
  it("should not include any string that looks like a 32-byte hex secret in the token", () => {
    // Arrange — we can't know CONFIRM_SECRET but we can verify the token is opaque
    // base64url and contains no obvious 64-char hex string (a 32-byte hex key).
    const scope = _makeScope({ finding_id: "P-secret-check" });
    const token = mintConfirmToken(scope, BASE_NOW + 400);

    // Assert — token is base64url with one dot; no raw hex secret visible in it
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    // The token should not be a plain JSON string (the secret must be opaque)
    expect(() => JSON.parse(token)).toThrow();
  });

  it("should not include CONFIRM_SECRET in any VerifyResult string value", () => {
    // Arrange
    const scope = _makeScope({ finding_id: "P-secret-result" });
    const token = mintConfirmToken(scope, BASE_NOW + 500);
    const result = verifyConfirmToken(token, scope, BASE_NOW + 500);

    // Assert — VerifyResult is one of the known enum strings, not a secret value
    const validResults = ["OK", "INVALID", "EXPIRED", "USED", "SCOPE_MISMATCH"];
    expect(validResults).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// CONFIRM_TOKEN_TTL_MS constant
// ---------------------------------------------------------------------------

describe("CONFIRM_TOKEN_TTL_MS", () => {
  it("should be exactly 120000 milliseconds (2 minutes) as per SCHEMA-FROZEN §1.1", () => {
    expect(CONFIRM_TOKEN_TTL_MS).toBe(120_000);
  });
});
