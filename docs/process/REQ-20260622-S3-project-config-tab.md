# REQ-20260622-S3: Project Detail — Config / Overview Tab

> **Mode:** COMBINED Phase 1+2 (T3 LITE_COMBINED). Complexity **S**, read-only,
> low risk. The companion story is `docs/process/stories/REQ-20260622-S3.md`.

## Workflow Status (reduced pipeline — Rule 0)
- [x] Phase 1 + 2: PO Analysis + Story Refinement (COMBINED) — IN PROGRESS
- [ ] Phase 3: Architect Review (freeze the `ProjectConfig` contract)
- [ ] Phase 4: Implementation (backend reader + contract + frontend ConfigCard)
- [ ] Phase 5: Code Review
- [ ] Phase 6: Tests (+ 6.8 runtime smoke)
- [ ] Phase 7: Final Audit
- [~] **Skipped:** 2.5 (test plan folded into the story's Tests AC), 5.5
  (security — read-only, no new write/subprocess surface; same trust boundary
  as S2), 6.5 (e2e), 6.7 (deployment) — justification below.

**Why these skips are safe:** S3 adds one more *read-only* fs adapter and one
*curated projection* field on an existing GET endpoint. No new write path, no
subprocess, no auth surface, no new route. The fs trust boundary
(`projectPath` from the registry, never the `:name` param) is unchanged from
S2 (SCHEMA-FROZEN-S2 §4). If Architect Review disagrees, re-add 5.5.

## 1. Requirement Summary
Fill the **Config** tab (the first/default tab of the Project Detail page,
whose inert shell already exists from S2) with a curated overview of the
selected project's `kuraka.config.yaml`, read **live** from
`<project.path>/kuraka.config.yaml`. The backend curates a small, fixed subset
of fields; the frontend renders them as labeled rows, with a first-class
"config not present" empty state for the projects that have no config file.

## 2. Scope

### In Scope
- Backend repository adapter `readProjectConfig(projectPath)` —
  `yaml.parse` of `<projectPath>/kuraka.config.yaml`, degrade to `null` on
  absent/unreadable/malformed, **never throw** (mirrors `readLockVersion`).
- A curated `ProjectConfig` zod contract (small fixed subset of the config —
  the ConfigCard rows below), all fields nullable/optional.
- Extend `ProjectDetail` with `config: ProjectConfig | null` (endpoint
  decision **(a)** — §4). No new route.
- Frontend `ConfigCard` component rendering the labeled rows; wired into the
  **Config** tab content in `ProjectDetailShell.tsx`.
- First-class **config-absent** empty state ("No kuraka.config.yaml in this
  project") — NOT an error.

### Out of Scope
- The other four tabs: **Project Layer** (S4), **RETRO** (S5),
  **Telemetría** (S6), **Agentes** (S9) — remain inert.
- Making the tabs *interactive* (active-tab switching / routing). S2 ships an
  inert tabs bar with Config visually active; S3 only makes the Config tab's
  **content** real. Tab navigation is a separate concern (deferred; flag for
  whoever builds S4).
- Editing config (read-only plane; consumer projects are read-only — CLAUDE.md).
- Surfacing the *full* config (database, paths, all conventions, `*_cmd`,
  vendor-specific keys). S3 surfaces only the curated ConfigCard subset.
- Schema-version handling / migration of `schema_version != 1`.

## 3. Table Inventory
Not applicable — **no database** (`stack.backend.orm: none`; the vault +
project filesystems are the store). No tables created or altered.

## 4. Affected Endpoints

| Method | Path | Action | Auth |
|--------|------|--------|------|
| GET | `/api/projects/:name` | **Extend** response with `config: ProjectConfig \| null` | No (single local user) |

**Endpoint decision — (a) extend `ProjectDetail`, recommended.**

| | (a) extend `ProjectDetail.config` *(chosen)* | (b) separate `GET /api/projects/:name/config` |
|---|---|---|
| Fetches to render the default tab | 1 (already in flight from S2) | 2 (detail + lazy config) |
| Payload size | tiny — curated subset (~8 small fields) | tiny |
| Matches existing composition pattern | yes — same as S2's `drift` (`ProjectSummary.extend`) | no — new route + new fetch hook |
| Config is the **default** tab (loads immediately) | favors (a): no lazy benefit when always shown | lazy-load wasted |
| Future tabs (S4 Project Layer, S6 Telemetría) | may be larger/heavier | per-tab endpoints will likely be justified **for those** |

**Recommendation:** (a). The curated subset is small and Config is the tab that
renders on first paint, so a lazy second request buys nothing and adds a hook +
loading state. Compose `config` onto `ProjectDetail` exactly as S2 composed
`drift` (`ProjectDetail = ProjectSummary.extend({ drift, config })`).
**Note for later:** S4/S6 (Project Layer file walk, telemetry aggregation) read
heavier sources and open on a non-default tab — those tabs *should* argue for
per-tab lazy endpoints. S3 sets no precedent forbidding that; it only declines
lazy-loading for the small, default-tab Config payload.

## 5. Affected Services & Repositories

| File | Action | Description |
|------|--------|-------------|
| `backend/src/repositories/projectReader.ts` | ALTER | Add `readProjectConfig(projectPath): Promise<ProjectConfig \| null>` — `yaml.parse`, curate the fixed subset, degrade to `null`. Never throws. |
| `backend/src/repositories/projectReader.test.ts` | ALTER | Add cases: present/full, present/partial (no frontend, no state_mgmt), absent (ENOENT → null), malformed YAML → null, `stack`-empty, top-level `stack.language` shape (waCert). |
| `backend/src/services/projectDetail.ts` | ALTER | Add `readProjectConfig(summary.path)` to the existing `Promise.all`; include `config` in the assembled `ProjectDetail`. |
| `backend/src/services/projectDetail.test.ts` | ALTER | Assert `config` present when file exists, `null` when absent — both still **200**. |
| `packages/contracts/src/index.ts` | ALTER | Add `ProjectConfig` zod (curated, permissive) + `.extend({ config })` on `ProjectDetail`. |
| `frontend/src/components/ConfigCard.tsx` | CREATE | Labeled-rows card; renders only present rows; config-absent empty state. |
| `frontend/src/components/ConfigCard.test.tsx` | CREATE | Renders full config; hides absent rows; shows empty state when `config === null`. |
| `frontend/src/routes/ProjectDetailShell.tsx` | ALTER | Render `<ConfigCard config={data.config} />` as the Config tab content below the header. |

(Paths follow the S1/S2 layered layout: `route → service → repository → domain`,
shared contract in `packages/contracts`. No new directory invented.)

## 6. Dependencies
- **Internal:** S2 (`ProjectDetail`, `findProjectByName`, the detail route +
  `ProjectDetailShell` header/tabs shell) — done. Reuses `yaml` (already a
  backend dep, used by `readLockVersion`).
- **External:** none.

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-enumerating externally-owned config values (`naming_language`, `null_syntax`, `default_mode`) would crash the parse on a real value not in the enum (cf. SCHEMA-FROZEN-S1, registry `status: mapped`). | Medium | **[LL-008]** type every curated config field as `z.string()` / nullable — never `z.enum`. GATE0 sampled live values: `naming_language ∈ {english, spanish, mixed}`, `null_syntax` ranges to a full prose sentence, `default_mode ∈ {normal, brownfield}`. Map to display at the component layer with neutral fallback. |
| Assuming a section exists (`stack.backend`, `stack.frontend`, `state_mgmt`, `architecture.layers`) crashes on real configs that omit it. | Medium | Reader reads each field defensively (optional chaining on the parsed object); contract fields all nullable; ConfigCard renders only present rows. GATE0 found `bol-cert-no-deudor` has empty `stack:`, `clinicaDental2026` has frontend-only, `waCert` puts `language`/`runtime` at the `stack` top level. |
| Treating config-absent as an error/404. | Medium | First-class empty state (`config: null` + ConfigCard empty panel), mirroring S2's `not_pinned`. GATE0: 2/8 projects (`guai-home-marketplace`, `sie_v2`) have **no** config file — this is normal, not a fault. |
| Malformed YAML throwing out of the reader → 500 for the whole detail page. | Low | `try/catch` collapses ENOENT/EACCES/parse errors to `null` (same shape as `readLockVersion`); detail page still renders header + drift + empty config. |
| Project path missing on disk. | Low | `fs.readFile` ENOENT → `null`; identical handling to absent file. |
| `:name` param reaching the filesystem. | Low | Unchanged from S2: the path comes from the registry's trusted `path` field; `:name` is only a registry lookup key (SCHEMA-FROZEN-S2 §4). No new attack surface. |

## 8. GATE0 — Live-Data Validation (resolved decisions)

**Source verified:** `<project.path>/kuraka.config.yaml`, parsed with the `yaml`
dep. Registry = `<vault>/projects/*.md` (9 entries; 8 distinct paths —
`dbcanvas` and `plugginsqlagent` share `/Users/xmn/Desarrollos/PlugginSQLAgent`).

**Config-presence census (8 distinct paths):**

| Project | Has `kuraka.config.yaml`? |
|---|---|
| bol-cert-no-deudor | yes |
| clinicaDental2026 | yes |
| dbcanvas / plugginsqlagent (PlugginSQLAgent) | yes |
| guai-home-marketplace | **NO** |
| kuraka-control | yes |
| sie_v2 | **NO** |
| trackingunidades | yes |
| waCertificadoNoDeudor | yes |

→ **Config-absent is a real, first-class state (2/8).** Not an error.

**Shape variability observed (drives permissive typing + nullable rows):**
- `stack` can be: empty/null (`bol-cert-no-deudor`), frontend-only
  (`clinicaDental2026`), backend+frontend (most), or have **top-level**
  `language`/`runtime` siblings to `backend`/`frontend` (`waCert`).
- `frontend.state_mgmt ∈ {signals, zustand, redux, absent}` — open set.
- `architecture.layers` can be `[]`, a populated list, or empty/null.
- `conventions.naming_language ∈ {english, spanish, mixed}` — **not** closed.
- `conventions.null_syntax` ranges from `"T | None"` / `"T?"` to a multi-line
  prose sentence (`waCert`) — **must be `z.string()`**.
- `workflow.default_mode ∈ {normal, brownfield}` — open.
- Unknown extra keys appear (`runtime`, `auth`, `database`, `identifier_style`,
  `country_dimension`, `data_access_pattern`, `confidence`, …). The reader
  curates a fixed subset and **ignores everything else** (no strict schema on
  the raw parse).

**Decisions (recorded):**
1. **Endpoint:** (a) — extend `ProjectDetail.config: ProjectConfig | null`.
2. **Typing [LL-008]:** every curated config value field is `z.string()` /
   nullable; numeric limits are `z.number().nullable()`; **no `z.enum`** on any
   externally-owned config value.
3. **Absent → `null` → first-class empty state** (not 404, not 500).
4. **Defensive curation:** the reader handles every section being optional and
   tolerates the top-level-`language` shape; renders only present rows.

**Blocker?** None. Proceeding to the combined story.
