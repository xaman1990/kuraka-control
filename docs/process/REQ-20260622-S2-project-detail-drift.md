# REQ-20260622-S2: Project Detail header + drift indicator (live version vs vault)

## Workflow Status

Risk profile: **Normal, risk-reduced**. New endpoint with real logic (drift
computation) + a new backend capability (live read of a *consumer project's*
filesystem). It is read-only (no shell-out, no writes), single-user, no DB,
no auth — so the heavyweight gates collapse.

- [x] Phase 1: PO Analysis — IN PROGRESS
- [ ] Phase 2: Story Refinement
- [ ] Phase 3: Architect Review (freezes the `drift` enum + the `ProjectDetail` contract)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] Phase 6: Tests
- [ ] Phase 7: Final Audit

Skipped (justify): **2.5** (test-planning folded into 6 — drift is a pure
function, AC table is the plan), **5.5** (security review — read-only, no
secrets, no auth, no tenant model; the only new attack surface is path
traversal on `:name`, covered as an explicit AC in code review §7),
**6.5** (e2e — no golden user flow beyond a render, covered by 6.8 smoke),
**6.7** (deployment-verifier — no infra change). Confirm with user before Phase 2.

## Resolved clarifications

GATE0 (`requirement-consistency-check`) ran against live data BEFORE this REQ.
Result: **PASS — no blockers.** Three potential blockers were resolved by a
recommended decision (each open for user override at the Phase-1 gate):

1. **Three candidate "versions" exist — which comparison is the S2 drift?**
   - Registry frontmatter `kuraka_version` (`<vault>/projects/*.md`, already in `ProjectSummary`).
   - Live `kuraka_version` in `<project.path>/kuraka.lock` (what is *actually* mounted).
   - Vault-current version.
   - **Resolved:** the S2 drift indicator answers *"is what's mounted in the
     project up to date with the vault?"* → it compares **live lock version**
     vs **vault-current version**. The registry value is a *secondary signal*
     surfaced in the contract (`registry_version`) so the UI can flag a
     registry⇄lock mismatch, but the primary `drift.state` is lock-vs-vault.
     Rationale: the lock is the only source that reflects the project's *real*
     mounted state; the registry can be stale (it is stamped at mount and never
     re-read). The `kuraka.lock` comment itself names this comparison authoritative.

2. **Most projects have no `kuraka.lock` — is `not_pinned` a real state?**
   - **Live-data finding (verified 2026-06-22):** **7 of 8** registered projects
     have **no `kuraka.lock` on disk** (absent for sie_v2, clinicaDental2026,
     dbcanvas, plugginsqlagent, guai-home-marketplace, trackingunidades,
     wacertificadonodeudor). Only **kuraka-control** has one (`0.3.4`). They were
     mounted with the older flow.
   - **Resolved:** `not_pinned` is a **first-class, majority-case state**, not an
     edge case. The indicator must render it as a neutral/informational badge
     (not an error, not "behind"). This is the single most important UX decision
     in S2.

3. **Vault-current version source is fragile (a Python constant).**
   - **Live-data finding:** there is **no `VERSION` file and no `kuraka.lock` in
     the vault root**. The only machine-readable source today is
     `DEFAULT_VERSION = "0.3.4"` at `<vault>/kuraka-init.py:41`.
   - **Resolved (recommended):** for S2, read the vault-current version by
     parsing the `DEFAULT_VERSION = "x.y.z"` assignment from `kuraka-init.py`
     with a narrow, anchored regex in the **repository (fs-adapter) layer**, and
     treat any parse failure as `vault_version_unreadable` → drift state
     `unknown` (never crash). **Flag for the architect (Phase 3):** this is a
     fragile seam; recommend a follow-up story to have the vault expose a
     canonical `VERSION` file the backend reads instead. Do NOT block S2 on it.

4. **Current data has no live `behind`/`ahead` case.** All registry entries,
   the one live lock, and `DEFAULT_VERSION` are all `0.3.4`. So today every
   project resolves to `up_to_date` (kuraka-control) or `not_pinned` (the rest).
   The `behind`/`ahead` branches are correct-by-construction but **cannot be
   validated against live data** — tests must synthesize a lock with a different
   version (recorded as a risk).

5. **Two registry entries share one path** (`dbcanvas` and `plugginsqlagent`
   both → `/Users/xmn/Desarrollos/PlugginSQLAgent`). Not S2's concern (S2 keys
   by registry `name`), noted for downstream awareness.

## 1. Requirement Summary

Replace the S1 `ProjectDetailShell` placeholder with a real Project Detail
**header** and a **drift indicator** that compares the Kuraka framework version
**mounted live in the project** (`<project.path>/kuraka.lock`) against the
**vault's current version**. This requires the `GET /api/projects/:name`
endpoint that S1 deliberately deferred. Scope is **header + drift only**.

## 2. Scope

### In Scope
- `GET /api/projects/:name` — returns the `ProjectSummary` (already frozen in
  S1) **plus** a computed `drift` object. Backend reads the project's live
  `kuraka.lock` and the vault-current version (read-only).
- A new `ProjectDetail` response contract in `packages/contracts`
  (`ProjectSummary` + `drift`).
- Frontend: `ProjectDetailShell` becomes a **real fetch** of
  `GET /api/projects/:name` (replacing the react-query list-cache lookup), and
  renders the detail **header** (name, path, stack, status, governance badge)
  + the **drift indicator** badge.
- First-class empty/error states: `404 NOT_FOUND`, project path missing on disk,
  `kuraka.lock` absent (`not_pinned`), vault version unreadable (`unknown`).

### Out of Scope
- Detail **tabs**: Config (**S3**), Project Layer (**S4**), RETRO (**S5**) —
  the shell keeps a "arriving in S3–S5" stub for the body region.
- **Actions**: Re-mount / Validate / Sync (**S7**) — no shell-out, no writes.
- Monitor / live SSE drift updates (**S8**) — S2 drift is computed on request only.
- Any change to the vault, the registry, or any consumer project's files.
- A canonical vault `VERSION` file (recommended follow-up, not S2).

## 3. Table Inventory

Not applicable — **no database** (`stack.backend.orm: none`; the vault + project
filesystems are the store, adr-003). No tables are created, altered, or read.
(`conventions.multi_tenant: false` → no tenant column.)

## 4. Affected Endpoints

| Method | Path | Action | Auth | In Jira? |
|--------|------|--------|------|----------|
| GET | `/api/projects/:name` | Read one registry entry + compute drift (live lock vs vault) | No (single local user, NFR) | Yes (deferred from S1) |

Behaviors:
- **200** → `ProjectDetail` (`ProjectSummary` + `drift`).
- **404** `NOT_FOUND` → `:name` not present in the vault registry.
- The endpoint **never 500s** for the absent-lock / missing-path / unreadable-vault
  cases — those resolve to a `drift.state` value (see §Drift model), 200.

## 5. Affected Services & Repositories

File paths follow the locked Express layering (`route → service → repository →
domain`) and `architecture.paths`. Names below are **proposals** for the
story-refiner / architect to confirm against the S1 layout
(`backend/src/{routes,services,repositories,domain}`); the architect freezes them.

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/src/index.ts` | ALTER | Add `DriftState` (`z.enum`, app-owned), `Drift` object, `ProjectDetail` (= `ProjectSummary` + `drift`) schemas + inferred types. |
| `backend/src/routes/projects.ts` | ALTER | Add `router.get("/projects/:name")`; validate `:name`; map service result to 200/404 envelope. |
| `backend/src/services/projectDetail.ts` | CREATE | Use-case: resolve registry entry by name → if absent return NOT_FOUND; else read live lock + vault version via repository, compute `drift`, return validated `ProjectDetail`. Pure drift comparison stays in `domain`. |
| `backend/src/domain/drift.ts` | CREATE | Pure function `computeDrift(lockVersion: string \| null, vaultVersion: string \| null): Drift`. No fs. Unit-tested in isolation (this is where `behind`/`ahead`/`not_pinned`/`unknown` logic lives). |
| `backend/src/repositories/projectReader.ts` (or S1's registry reader) | ALTER/CREATE | Add: read one registry entry by name; read `<project.path>/kuraka.lock` (parse `kuraka_version`, tolerate absent/unreadable → null); read vault-current version (parse `DEFAULT_VERSION` from `kuraka-init.py` → null on failure). |
| `frontend/src/routes/ProjectDetailShell.tsx` | ALTER | Replace list-cache lookup with `useQuery(["project", name], GET /api/projects/:name)`. Render header + drift badge. Keep S3–S5 body stub. Handle 404 / loading / error. |
| `frontend/src/components/DriftBadge.tsx` (proposed) | CREATE | Owns the `DriftState → badge variant + label` display-map (exported once per LL-009). Neutral fallback for any unknown state. |

No symbols are removed or renamed in S2 → the mandatory removal/rename grep is
**N/A**. (S2 is additive; `ProjectSummary` is frozen and untouched.)

## Drift model

### Version sources (resolved in GATE0)
| Source | Location | Field | Notes |
|--------|----------|-------|-------|
| **Live mounted** (authoritative for drift) | `<project.path>/kuraka.lock` | `kuraka_version` | Absent for 7/8 projects today → `null` ⇒ `not_pinned`. |
| **Vault current** | `<vault>/kuraka-init.py:41` | `DEFAULT_VERSION = "x.y.z"` | No VERSION file exists. Parse via anchored regex; failure ⇒ `null` ⇒ `unknown`. Fragile — flag to architect. |
| **Registry** (secondary signal) | `<vault>/projects/<name>.md` fm | `kuraka_version` | Already in `ProjectSummary`. Surfaced as `drift.registry_version`; a registry⇄lock mismatch is an *informational* flag, not the primary state. |

### Comparison rule
`drift.state = computeDrift(lockVersion, vaultVersion)` where versions are
compared as **semver** (`major.minor.patch`):
- `lockVersion == null` → `not_pinned` (project has no `kuraka.lock`).
- `vaultVersion == null` → `unknown` (vault version unreadable).
- `lock == vault` → `up_to_date`.
- `lock < vault` → `behind` (carry the numeric gap if available, see below).
- `lock > vault` → `ahead`.
- versions present but unparseable as semver → `unknown` (never throw).

### Enumerated drift states — **app-OWNED → typed `z.enum` is correct** (LL-008)
Unlike the externally-mirrored `status` field (which stays `z.string()` because
the vault owns its vocabulary), `drift.state` is **computed by this app**. Its
vocabulary is fully app-controlled and closed, so a `z.enum` is the right choice
here per the `api-contract.md` "App-owned vs externally-owned" rule.

Proposed closed set:
```
DriftState = z.enum([
  "up_to_date",     // lock == vault
  "behind",         // lock < vault
  "ahead",          // lock > vault   (vault rolled back / pre-release lock)
  "not_pinned",     // no kuraka.lock on disk  (MAJORITY case today: 7/8)
  "unknown",        // vault version or semver parse failed
])
```
`registry_lock_mismatch` is modeled NOT as a `state` but as a **boolean flag**
(`drift.registry_matches_lock`) so it composes orthogonally with any state
(a project can be `up_to_date` *and* have a stale registry). Architect confirms.

## 5b. API contract sketch

```ts
// packages/contracts/src/index.ts (additions)

export const DriftState = z.enum([
  "up_to_date", "behind", "ahead", "not_pinned", "unknown",
]);
export type DriftState = z.infer<typeof DriftState>;

export const Drift = z.object({
  state: DriftState,                       // app-owned union (LL-008)
  lock_version: z.string().nullable(),     // <project>/kuraka.lock kuraka_version, null if absent
  vault_version: z.string().nullable(),    // parsed DEFAULT_VERSION, null if unreadable
  registry_version: z.string(),            // mirror of ProjectSummary.kuraka_version
  registry_matches_lock: z.boolean().nullable(), // null when lock absent (nothing to compare)
  // optional: gap: z.number().nullable()  // minor/patch distance when both semver-parseable
});
export type Drift = z.infer<typeof Drift>;

export const ProjectDetail = ProjectSummary.extend({   // ProjectSummary frozen in S1
  drift: Drift,
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;
```
- **Seam casing = snake_case** end-to-end (mirrors vault frontmatter; no
  camelCase boundary, per `api-contract.md`). `drift` sub-fields stay snake_case
  for consistency with the rest of the projection.
- **404 case** uses the uniform error envelope:
  `{ "error": { "code": "NOT_FOUND", "message": "Project '<name>' is not registered in the vault", "detail": { "name": "<name>" } } }`.
- The frontend infers `ProjectDetail` from the shared zod schema (single type source).

## 6. Dependencies

- **S1 (hard):** the frozen `ProjectSummary` zod schema (`packages/contracts`),
  the `/projects/:name` route (`ProjectDetailShell`), and the registry reader
  (`<vault>/projects/*.md` parser). S2 extends, does not redefine, these.
- **Vault scripts (read-only):** `<vault>/kuraka-init.py` (source of
  `DEFAULT_VERSION`). No subprocess invocation — the file is *read and parsed*,
  not executed.
- **Live consumer-project fs:** `<project.path>/kuraka.lock`. New read capability
  (read-only) inherited by S3/S4 — establish the fs-safe read helper here.
- No external/library dependency; no new npm package.

## 6b. Empty / error states (first-class — NFR "no silent failure")

| Condition | Backend behavior | `drift.state` | UI |
|-----------|------------------|---------------|-----|
| `:name` not in registry | **404** `NOT_FOUND` envelope | — | Not-found panel (reuse S1's shell not-found copy). |
| Registry entry exists, `path` **missing on disk** | 200 (still return summary + drift) | `not_pinned` (no lock readable) | Drift badge `not_pinned` + a subtle "path not found on disk" hint in the header. |
| `kuraka.lock` **absent** (7/8 today) | 200 | `not_pinned` | Neutral/informational badge — **not** an error, **not** "behind". Tooltip: "No kuraka.lock — mounted with the legacy flow." |
| `kuraka.lock` present but unreadable / no `kuraka_version` | 200 | `not_pinned` (lock_version=null) | Same as absent. |
| Vault version unreadable (`kuraka-init.py` gone / regex miss) | 200 | `unknown` | Muted badge "vault version unknown". |
| Versions present but not semver | 200 | `unknown` | Same. |
| Registry ≠ lock (both present) | 200 | the real lock-vs-vault state | Inline "registry stamp out of date" chip driven by `registry_matches_lock=false`. |

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vault-current version comes from a Python constant (`DEFAULT_VERSION`), no canonical VERSION file | Medium | Anchored regex in the repository layer; parse failure → `unknown`, never crash. Flag follow-up story for a vault `VERSION` file to the architect (Phase 3). |
| `not_pinned` is the **majority** (7/8) — easy to mis-render as an error/"behind" | High | Make `not_pinned` first-class, neutral styling; explicit AC + smoke check on an absent-lock project (e.g. sie_v2). |
| No live `behind`/`ahead` data exists (all `0.3.4`) — those branches untestable end-to-end | Medium | Unit-test `computeDrift` with synthetic versions (the pure-domain split exists exactly for this). |
| **New capability: backend reads a consumer project's live fs** (`<path>/kuraka.lock`). Inherited by S3/S4 | Medium | Path comes from the trusted registry; resolve + verify existence; read-only; absent/unreadable ⇒ graceful state, no throw. Establish the fs-safe read helper here so S3/S4 reuse it. |
| Path traversal via `:name` reaching the fs read | Low | `:name` keys the **in-memory registry map**, not a path; only the registry-supplied `path` touches the fs. Add an AC: never interpolate `:name` into a filesystem path. |
| Drift sub-field casing / extra field drifts from S1's frozen `ProjectSummary` | Low | `ProjectDetail = ProjectSummary.extend({ drift })` — reuse, never redeclare the summary fields. |

## 8. Proposed Stories

**Recommendation: keep S2 as a single story** (no BE/FE split). The surface is
small, the contract is the seam, and `parallel_implementation: true` lets the
implementer build contract → backend → frontend in one pass with one `make test`.
A split would add a coordination gate for ~1 endpoint + 2 components.

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S2 | Project Detail header + drift indicator + `GET /api/projects/:name` | M | S1 (ProjectSummary contract + ProjectDetailShell route + registry reader) |

Internal AC ordering for the story-refiner (single story, sequenced):
1. Contract: `DriftState` / `Drift` / `ProjectDetail` zod schemas.
2. Domain: `computeDrift` pure function + unit tests (all 5 states, incl. synthetic behind/ahead).
3. Repository: read-one-by-name, read live lock, parse vault version (all null-tolerant).
4. Service + route: `GET /api/projects/:name`, 200 / 404.
5. Frontend: real fetch in `ProjectDetailShell`, header, `DriftBadge` (display-map exported once, LL-009).
6. Phase 6.8 smoke: render `/projects/kuraka-control` (`up_to_date`) **and** an
   absent-lock project (`not_pinned`) in the browser.

## Confidence: HIGH

All drift sources verified against live data in GATE0 (locks, registry, vault
constant). The one residual uncertainty — the fragile `DEFAULT_VERSION` parse —
is explicitly surfaced as a risk + an `unknown` fallback, so it does not lower
confidence in the contract. The contract reuses S1's frozen `ProjectSummary`
via `.extend`. No DB, no auth, no removal/rename. The only open choices
(single-story vs split; `registry_lock_mismatch` as flag vs state) are
recommendations the architect confirms in Phase 3 — neither blocks refinement.
