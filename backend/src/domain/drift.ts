/**
 * Domain layer — pure drift computation (S2).
 *
 * No fs, no process.env, no external I/O. Unit-testable without mocks.
 * Implements the FROZEN decision table from SCHEMA-FROZEN-S2.md §2.
 * Implements the FROZEN version-compare rule from SCHEMA-FROZEN-S2.md §3.
 */
import type { DriftState } from "@kuraka-control/contracts";

/**
 * Parses a version string into [major, minor, patch] segments, or returns null
 * when the string is not exactly three dot-separated non-negative integers.
 *
 * Required: /^\d+\.\d+\.\d+$/ — no pre-release, no build metadata, no "v" prefix.
 * Examples that return null: "latest", "v0.3.4", "0.3", "0.3.4-rc1", "".
 */
function parseVersion(v: string): [number, number, number] | null {
  if (!/^\d+\.\d+\.\d+$/.test(v)) return null;
  const parts = v.split(".").map(Number);
  return [parts[0]!, parts[1]!, parts[2]!];
}

/**
 * Compares two semver strings segment-wise (numeric, not lexicographic).
 *
 * Returns:
 *  -1 when a < b
 *   0 when a == b
 *   1 when a > b
 *  null when either string is not parseable as semver.
 *
 * FROZEN test vector: compareVersions("0.3.10", "0.3.9") === 1
 */
export function compareVersions(
  a: string,
  b: string,
): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return null;

  const [a0, a1, a2] = pa;
  const [b0, b1, b2] = pb;

  if (a0 !== b0) return a0 > b0 ? 1 : -1;
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  return 0;
}

/**
 * Computes the DriftState from lock and vault version strings.
 *
 * Implements the FROZEN decision table (top-down, first match wins):
 *   1. lockVersion === null                        → "not_pinned"
 *   2. vaultVersion === null                       → "unknown"
 *   3. either not parseable as semver              → "unknown"
 *   4. cmp === 0                                   → "up_to_date"
 *   5. cmp < 0  (lock < vault)                     → "behind"
 *   6. cmp > 0  (lock > vault)                     → "ahead"
 *
 * Row 1 short-circuits: a not_pinned project never reports "unknown" even
 * when the vault version is also unreadable.
 * Never throws.
 */
export function computeDrift(
  lockVersion: string | null,
  vaultVersion: string | null,
): DriftState {
  // Row 1 — no lock file; short-circuit regardless of vault version
  if (lockVersion === null) return "not_pinned";

  // Row 2 — vault version unreadable
  if (vaultVersion === null) return "unknown";

  // Rows 3–6 — both present; compare numerically
  const cmp = compareVersions(lockVersion, vaultVersion);

  // Row 3 — either version not parseable as semver
  if (cmp === null) return "unknown";

  // Row 4
  if (cmp === 0) return "up_to_date";

  // Row 5
  if (cmp < 0) return "behind";

  // Row 6
  return "ahead";
}
