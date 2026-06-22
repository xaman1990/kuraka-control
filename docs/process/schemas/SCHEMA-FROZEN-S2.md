# SCHEMA-FROZEN-S2 — Project Detail + Drift contract

> **FROZEN AT 2026-06-22T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for Phase 4. This freezes the `drift` seam that S3/S4 inherit
> (they extend `ProjectDetail`, never redefine it). Extends `SCHEMA-FROZEN-S1`
> (`ProjectSummary` is frozen and untouched here). Any deviation requires a new
> architect-review cycle, not an inline edit.

## 0. What this freezes

1. The EXACT zod for `DriftState`, `Drift`, `ProjectDetail`.
2. The **drift decision table** (mounted × vault × registry → state).
3. The **version-compare rule** (segment-wise numeric, with the `0.3.10 > 0.3.9` case).
4. The **`kuraka.lock` parse rule** (YAML via the `yaml` dep — NOT `JSON.parse`).
5. The **`DEFAULT_VERSION` extraction rule** (anchored regex + `null` fallback).

---

## 1. EXACT zod for `packages/contracts/src/index.ts` (additions)

Append AFTER the frozen `ProjectSummary` / `ProjectListResponse` block. Do not
touch `ProjectSummary`, `ProjectListResponse`, `ApiError`, or `Governance`.

```ts
/** Drift state — APP-OWNED, closed vocabulary (LL-008 → z.enum is correct). */
export const DriftState = z.enum([
  "up_to_date",   // lock == vault  (segment-wise equal)
  "behind",       // lock <  vault
  "ahead",        // lock >  vault  (vault rolled back / pre-release lock)
  "not_pinned",   // no readable kuraka.lock on disk  (MAJORITY: 7/8 today)
  "unknown",      // vault version unreadable OR either version not semver
]);
export type DriftState = z.infer<typeof DriftState>;

export const Drift = z.object({
  state: DriftState,                              // app-owned union (LL-008)
  lock_version: z.string().nullable(),            // <project>/kuraka.lock kuraka_version; null if absent/unreadable/missing-field
  vault_version: z.string().nullable(),           // DEFAULT_VERSION from kuraka-init.py; null if unreadable/regex-miss
  registry_version: z.string(),                   // mirror of ProjectSummary.kuraka_version (already string in S1)
  registry_matches_lock: z.boolean().nullable(),  // null when lock_version is null (nothing to compare)
});
export type Drift = z.infer<typeof Drift>;

/** Detail = the frozen summary + computed drift. Composition, NOT redefinition. */
export const ProjectDetail = ProjectSummary.extend({
  drift: Drift,
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;
```

### Frozen field rules

| Field | zod | Null ⇔ | Notes |
|-------|-----|--------|-------|
| `state` | `z.enum([...])` | never null | app-OWNED closed set (LL-008). NOT `z.string()`. |
| `lock_version` | `z.string().nullable()` | `null` ⇔ no readable lock / missing `kuraka_version` field | **`not_pinned` ⇔ `lock_version === null`** (coherent). Repository coerces the YAML value to string before assigning (a 2-dot `0.3` would parse as a float — `String()` it). |
| `vault_version` | `z.string().nullable()` | `null` ⇔ vault unreadable / regex miss | `vault_version === null` ⇒ `state === "unknown"` (when lock IS present). |
| `registry_version` | `z.string()` | never null | mirrors `summary.kuraka_version`, which S1 froze as `z.coerce.string()` (already a string in the projected record) — so `z.string()` here is sound; do NOT re-coerce. |
| `registry_matches_lock` | `z.boolean().nullable()` | `null` ⇔ `lock_version === null` | else `lock_version === registry_version` (string equality is fine — both are the same stamp source). |

### Nullability coherence (FROZEN — these biconditionals MUST hold)

- `state === "not_pinned"`  ⇔  `lock_version === null`.
- `registry_matches_lock === null`  ⇔  `lock_version === null`.
- `state === "unknown"` requires `lock_version !== null` AND
  (`vault_version === null` OR one of the two present versions is not semver-parseable).
- `state ∈ {up_to_date, behind, ahead}` requires BOTH `lock_version` and
  `vault_version` non-null AND both semver-parseable.

### Casing (FROZEN)
`drift` and all sub-fields are **snake_case**, consistent with the S1 seam
(no camelCase boundary). The shared zod schema is the single type source on
both sides (`ProjectDetail.parse(json)` on the frontend).

---

## 2. Drift decision table (FROZEN — the seam S3/S4 inherit)

`computeDrift(lockVersion: string | null, vaultVersion: string | null): DriftState`
is **pure** (no fs, no env). Evaluate top-to-bottom; first match wins.

| # | `lockVersion` | `vaultVersion` | Both parse as semver? | → `DriftState` |
|---|---------------|----------------|-----------------------|----------------|
| 1 | `null` | (any) | — (not evaluated) | `not_pinned` |
| 2 | non-null | `null` | — | `unknown` |
| 3 | non-null | non-null | **no** (either unparseable) | `unknown` |
| 4 | non-null | non-null | yes, `cmp == 0` | `up_to_date` |
| 5 | non-null | non-null | yes, `cmp < 0` (lock < vault) | `behind` |
| 6 | non-null | non-null | yes, `cmp > 0` (lock > vault) | `ahead` |

- **Row 1 short-circuits**: `lockVersion === null` returns `not_pinned`
  WITHOUT evaluating `vaultVersion` (AC-8). A `not_pinned` project never
  reports `unknown` even if the vault version is also unreadable.
- `computeDrift` **never throws** — an unparseable version routes to row 3, not an exception.

### `registry_matches_lock` (assembled in the SERVICE, not in `computeDrift`)

```
registry_matches_lock =
  lock_version === null  ?  null
                         :  (lock_version === registry_version)
```
Orthogonal to `state` — a project may be `up_to_date` AND have
`registry_matches_lock === false` (stale registry stamp). String equality is
correct here (both come from the same human-edited stamp; no semver compare).

---

## 3. Version-compare rule (FROZEN)

Versions are dotted strings (`"0.3.4"`). **String comparison is WRONG**
(`"0.3.10" < "0.3.9"` lexically). Use **segment-wise numeric compare**.

### Parse + compare contract

```
A version is semver-parseable iff it matches  /^\d+\.\d+\.\d+$/
  (exactly three dot-separated non-negative integer segments; no pre-release/build).
```

- A string that does NOT match (`"latest"`, `"0.3"`, `"v0.3.4"`, `"0.3.4-rc1"`,
  `""`) is **not parseable** → drift state `unknown` (table row 3). Frozen for S2;
  if semver pre-release support is ever needed, that is a new contract cycle.
- Compare by splitting on `.`, mapping each segment to `Number`, comparing
  `major`, then `minor`, then `patch`:

```
cmp(a, b):
  [a0,a1,a2] = a.split(".").map(Number)
  [b0,b1,b2] = b.split(".").map(Number)
  if a0 !== b0 return sign(a0 - b0)
  if a1 !== b1 return sign(a1 - b1)
  return sign(a2 - b2)
```

- **Required test vector (FROZEN):** `cmp("0.3.10", "0.3.9") === 1` (`0.3.10`
  is AHEAD of `0.3.9`). A string compare yields `-1` and is a defect. This case
  MUST appear in `drift.test.ts`.

### Implementation freeze
A **tiny in-repo split-and-compare helper** is the frozen choice — do NOT add a
semver npm package (Technical Note: "no new npm packages" holds). The helper
lives in `backend/src/domain/drift.ts` (pure, beside `computeDrift`), or inline.
No `semver` dependency.

---

## 4. `kuraka.lock` parse rule (FROZEN)

`kuraka.lock` is **YAML** (`key: value` with `#` comments). Verified live:

```yaml
# kuraka.lock — pins the mounted Kuraka framework version for this project.
kuraka_version: 0.3.4
mounted_at: 2026-06-07
vault: /Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka
```

- **Parse with the `yaml` dep** (already a backend dependency: `yaml@^2.6.0`).
  **NOT `JSON.parse`** (the file has `#` comments and bare scalars — `JSON.parse`
  throws on it). The AC-9 / Technical-Note hedge ("JSON.parse if plain JSON /
  js-yaml") is **resolved to: always `yaml.parse`** — the lock is never JSON, and
  the repo uses `yaml`, not `js-yaml`.
- Read `<projectPath>/kuraka.lock`, `yaml.parse` it, read the `kuraka_version`
  field, **coerce to string** (`String(value)` — a 2-dot value like `0.3` parses
  as a float). Return that string.
- Return **`null`** (never throw) when: file absent (`ENOENT`), unreadable
  (perm), YAML parse error, or `kuraka_version` field missing/empty. All four
  collapse to `lock_version: null` ⇒ `not_pinned`.
- **Path source = the registry's `project.path`** (trusted), joined via
  `path.join(projectPath, "kuraka.lock")`. The request `:name` is NEVER
  interpolated into a filesystem path (path-traversal AC-10). Read-only; no
  execution; no `..`/symlink escape.

---

## 5. `DEFAULT_VERSION` extraction rule (FROZEN — fragile seam, accepted for S2)

Vault-current version source today: `DEFAULT_VERSION = "0.3.4"` at
`<vaultRoot>/kuraka-init.py:41`. There is **no `VERSION` file and no vault-root
`kuraka.lock`** (verified live).

- `readVaultVersion(vaultRoot)` reads `<vaultRoot>/kuraka-init.py` and extracts
  with the **anchored regex** (FROZEN, verbatim):

  ```
  /^DEFAULT_VERSION\s*=\s*["']([^"']+)["']/m
  ```

  Capture group 1 is the version string. Single OR double quotes accepted.
- Return **`null`** (never throw) on: file absent, unreadable, or regex miss.
  `null` ⇒ `vault_version: null` ⇒ drift `unknown` (when lock present).
- Read-only — the file is **read and regex-parsed, NEVER executed** (no
  subprocess). No `child_process`. This stays in the repository (fs-adapter)
  layer; the domain `computeDrift` never touches fs.
- **Follow-up (LOGGED, NOT DONE HERE):** the vault should expose a canonical
  machine-readable `VERSION` file (or a vault-root `kuraka.lock`) that the
  backend reads instead of regex-scraping a Python constant. Recommend a
  dedicated story (`S2-followup: vault VERSION file`). S2 is **not** blocked on
  it; the `unknown` fallback contains the fragility.

---

## 6. API behavior (FROZEN)

`GET /api/projects/:name`:

- **200** → `ProjectDetail` (`ProjectSummary` + `drift`). Lookup keys by registry
  **`name`** (A3: paths can duplicate, names are identity). Reuses S1's
  `listProjects` / registry reader — does not re-walk the dir.
- **404** → `ApiError` with `code: "NOT_FOUND"` when `:name` not in the registry:
  ```json
  { "error": { "code": "NOT_FOUND",
               "message": "Project '<name>' is not registered in the vault",
               "detail": { "name": "<name>" } } }
  ```
  Use `ERROR_CODE_NOT_FOUND = "NOT_FOUND" as const`.
- **Never 500** for: absent/unreadable `kuraka.lock`, missing project `path` on
  disk, unreadable vault version, or non-semver versions. All resolve to a
  `drift.state` value and return 200. (NFR "no silent failure" is satisfied by
  the typed state, not by an error.)
- Route validates `:name` is a non-empty string with no path separators (defense
  in depth; `:name` never reaches the fs regardless).

---

**Vault path source:** `env.vaultRoot` (`backend/src/config/env.ts`), as in S1.
No new env var, no hardcoded path. `vaultRoot` is injectable into the repository
and service for tests (temp-dir fixtures).

**FROZEN AT 2026-06-22T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
