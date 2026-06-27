# REQ-20260620-S1: Registry reader + Projects list → detail route shell

## Workflow Status
- [x] Phase 1: PO Analysis — IN PROGRESS
- [ ] Phase 2: Story Refinement
- [ ] ~~Phase 2.5: Test Planning~~ — SKIPPED this cycle (orchestrator Rule 0; read-only, no state machine)
- [ ] Phase 3: Architect Review
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] ~~Phase 5.5: Security Review~~ — SKIPPED this cycle (read-only, no auth/mutation/shell-out; local single-user)
- [ ] Phase 6: Tests
- [ ] ~~Phase 6.5: E2E~~ — SKIPPED this cycle (golden-path e2e deferred until detail content exists, S2–S4)
- [ ] ~~Phase 6.7: Deployment Verify~~ — SKIPPED this cycle (no Docker/env/CI surface touched)
- [ ] Phase 7: Final Audit

> **Mode:** Normal, reduced per orchestrator Rule 0. Phase 6.8 runtime smoke
> (the `/projects` route renders from the live registry in a browser) is still
> mandatory and is NOT skipped — green tests ≠ working feature.

## 1. Requirement Summary

S1 makes kuraka-control read the Kuraka vault **registry** — the frontmatter of
`<vault>/projects/*.md` — and expose it over a read-only HTTP API. The frontend
gains a dedicated **`/projects`** route that renders the registry as a grid of
project cards; clicking a card navigates to a **project detail route shell**
(a placeholder). Detail tab *content* is out of scope and arrives in S2–S4.

## 2. Resolved clarifications

The following BLOCKER surfaced in GATE0 and was **RESOLVED by the user** before
this REQ. Recorded verbatim; it is binding on S1 and inherited by S2–S4.

> **Blocker (C6/C5):** the arki-seeded contract `ProjectSummary` in
> `packages/contracts/src/index.ts` types `status` as
> `z.enum(["active","paused","onboarding","archived"])`, but the live registry
> contains `status: mapped` (in `wacertificadonodeudor.md`). Observed live
> values: `onboarding`(5), `active`(2), `mapped`(1). A strict enum parse would
> throw at runtime on day one; the contract is inherited by S2–S4.
>
> **User decision:** Type `status` as a **permissive `z.string()`** in the
> contract (resilient — never throws nor drops a project). The **UI** maps a
> *known display set* `{active, paused, onboarding, archived, mapped}` to colored
> badges and renders any **unknown** status with a **neutral badge showing the
> literal value**. Rationale: kuraka-control is a *reader* of a registry whose
> `status` vocabulary is owned by the vault/framework; the contract must not be
> re-cut every time the vault introduces a new status. (Note:
> `conventions.enums_for_states` governs kuraka-control's OWN state machines,
> e.g. the triage model — not this mirrored external field.)

### Assumptions recorded (low-impact, safe defaults — analyzed in GATE0)

| # | Assumption | Decision |
|---|-----------|----------|
| A1 | **Empty-string-as-absent** | Live files use `last_sync: ""`, `last_mount: ""`, `focus_scope: ""`. The repository layer normalizes empty-string → `null` **before** zod parse; these fields are typed `.nullable()`. |
| A2 | **`repo_url`** | Present in every real file and in spec §4's field intent, but the arki contract omitted it while including `tags`. Add `repo_url` (often `""` → null) to the contract, nullable. |
| A3 | **Duplicate path** | `plugginsqlagent.md` and `dbcanvas.md` share the same `path`. Not fatal — the list keys by `name`. Recorded as a data observation + risk; the future on-disk drift check (S2+) must key by **name**, not path. |
| A4 | **Pre-existing assets** | The contract types + the `ProjectCard` component already exist (arki/S12). S1 **wires** them; it does not re-decide them (except the `status` change in §2). |

## 3. Scope

### In Scope
- Backend repository adapter that walks `<vault>/projects/*.md` (vault path from
  `KURAKA_VAULT`, default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`),
  parses YAML frontmatter, normalizes empties (A1), and projects to `ProjectSummary`.
- Backend service + Express route exposing the registry (see §5 endpoint decision).
- Contract change: `status` → `z.string()`; add `repo_url` nullable (see §4).
- First-class **empty & error states** (see §6) — no silent failure.
- Frontend dedicated **`/projects`** route: grid of `ProjectCard`s from the live
  API via react-query.
- Frontend **status badge mapping**: known display set → colored badge; unknown →
  neutral badge with literal value (per §2 user decision).
- Frontend **project detail route shell**: `/projects/:name` renders a placeholder
  (header + "detail coming in S2–S4"); card click navigates to it.
- Loading / empty / error UI for the list.

### Out of Scope
- **Detail-tab content** (overview, agents, telemetry, drift) — S2–S4.
- **Telemetry** read/aggregation — later story.
- **Mutations / shell-out** (mount, sync, validate, apply) — read-only this cycle.
- **Monitor / Resumen** screen (the fleet dashboard) — that is **S8**, not S1.
- On-disk **drift / path-validation** beyond the simple existence check noted in §6.
- SSE `/api/live` channel — not needed for a static registry read.

## 4. Registry data contract

Projection of `<vault>/projects/*.md` frontmatter → `ProjectSummary`. Reflects
the `z.string()` status decision (§2), nullable empties (A1), and `repo_url` (A2).

| Field | Type | Required? | Empty / absent handling |
|-------|------|-----------|--------------------------|
| `name` | `z.string()` | Yes | Required key; used as the stable identity & list key. Skip/degrade file if missing (see §6). |
| `path` | `z.string()` | Yes | Required. Not unique (A3) — never used as identity. |
| `stack` | `z.string()` | Yes | Free-form descriptor string. |
| `kuraka_version` | `z.string()` | Yes | e.g. `"0.3.4"`. |
| `has_project_layer` | `z.boolean()` | Yes | — |
| `default_mode` | `z.string()` | Yes | e.g. `"normal"`. |
| `status` | **`z.string()`** | Yes | **Permissive** (CHANGED from enum). UI badge-maps known set, neutral badge for unknown. |
| `repo_url` | `z.string().nullable()` | No | **ADDED.** `""` → `null` (A2). |
| `focus_scope` | `z.string().nullable()` | No | `""` → `null` (A1). |
| `last_mount` | `z.string().nullable()` | No | `""` → `null` (A1). ISO date string when present. |
| `last_sync` | `z.string().nullable()` | No | `""` → `null` (A1). ISO date string when present. |
| `tags` | `z.array(z.string())` | Yes | Defaults to `[]` if absent. |

> Empty-string normalization happens in the **repository layer** before zod parse
> (domain stays pure). The contract types the nullable fields; it does not itself
> rewrite `""`.

## 5. API endpoint(s)

| Method | Path | Action | Auth | Response contract |
|--------|------|--------|------|-------------------|
| GET | `/api/projects` | List registry | No (local single-user) | `ProjectListResponse` |

`ProjectListResponse = { projects: ProjectSummary[], empty: boolean }` (already in
contracts; matches the api-contract convention "empty is not an error — 200 +
`empty: true`").

### Decision: is `GET /api/projects/:name` needed for S1?

**No — the list payload suffices for the S1 detail shell. Do NOT build
`/api/projects/:name` this cycle.** Justification:

- The S1 detail route is a **shell/placeholder** with no per-project data beyond
  what's already in the card. The frontend can route to `/projects/:name`,
  read the matching `ProjectSummary` from the already-fetched react-query list
  cache, and render the placeholder header from it. No second fetch is required.
- Adding `/api/projects/:name` now means designing its (richer) response before
  S2–S4 define what the detail actually shows — premature, and it would be
  re-cut. The detail endpoint(s) belong to the story that owns detail content.
- This keeps S1 to a single, well-tested read endpoint and avoids speculative
  contract surface.

**Error envelope** (api-contract convention): non-empty failures return
`ApiError` with codes `VAULT_UNREADABLE | NOT_FOUND` (see §6).

## 6. Empty & error states (first-class — no silent failure)

| Condition | Backend behavior | Frontend behavior |
|-----------|------------------|-------------------|
| Vault path missing / unreadable (env points nowhere, no read perm) | `500` `ApiError{ code: "VAULT_UNREADABLE", message, detail:{path} }` | Error panel: "Cannot read the Kuraka vault at `<path>`" + the configured path; not an empty list. |
| Zero `projects/*.md` files (dir exists, empty) | `200` `{ projects: [], empty: true }` | First-class empty state: "No projects registered in the vault yet." |
| One malformed-frontmatter file (bad YAML, or missing required `name`) | **Degrade that one file, keep the rest.** Parse the others; do not fail the whole request. Surface skipped files in `detail` / server log. | List renders the healthy projects; (optional) a non-blocking notice that N file(s) were skipped. |
| Project `path` missing on disk | **Do not fail.** The registry entry is still returned (S1 is a registry reader, not a disk validator). | Card renders normally. (On-disk drift indication is deferred to S2+, and must key by **name** per A3.) |

> Robustness principle: a single bad file must never blank the whole fleet. The
> reader is fault-tolerant per-file and reports skips rather than throwing.

## 7. Affected Services & Repositories

File paths follow the Express layered architecture (`route → service → repository
→ domain`) from `kuraka.config.yaml` and ADR-002. Exact filenames are the
architect/story-refiner's to confirm; this is the layer map.

| Layer / File (indicative) | Action | Description |
|---------------------------|--------|-------------|
| `packages/contracts/src/index.ts` | ALTER | `status` → `z.string()`; add `repo_url: z.string().nullable()`. |
| `backend/.../domain` (frontmatter/registry parser) | CREATE | Pure parse of frontmatter → `ProjectSummary`; empty→null normalization. |
| `backend/.../repository` (vault registry reader) | CREATE | Walk `<KURAKA_VAULT>/projects/*.md`, read+gray-matter, per-file fault tolerance. |
| `backend/.../service` (registry use-case) | CREATE | Aggregate to `ProjectListResponse`; set `empty`; collect skipped files. |
| `backend/.../route` (`GET /api/projects`) | CREATE | HTTP shape, zod response validation, `ApiError` envelope. |
| `frontend/.../routes` (`/projects`, `/projects/:name`) | CREATE | react-router routes: list + detail shell placeholder. |
| `frontend/.../ProjectsPage` (list view) | CREATE | react-query fetch; grid of `ProjectCard`; loading/empty/error states. |
| `frontend/.../ProjectCard` | WIRE/ALTER | Pre-existing (S12). Wire to real data; add status-badge mapping (known set + neutral fallback). |
| `frontend/.../ProjectDetailShell` | CREATE | Placeholder detail; reads `ProjectSummary` from list cache by `name`. |

## 8. Dependencies
- **Live vault registry** at `KURAKA_VAULT` — external data the backend reads.
- **Frontmatter parsing**: `gray-matter` + `yaml` (already in the stack per CLAUDE.md).
- **Pre-existing arki/S12 assets**: contract schemas + `ProjectCard` component (A4).
- **react-query / react-router / Zustand / Tailwind v4** — already in the frontend stack.
- **Contract stability for S2–S4**: those stories inherit the `status: z.string()`
  decision and the `repo_url` addition; this REQ freezes both.

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontmatter robustness — a malformed file blanks the whole fleet | High | Per-file fault tolerance (§6): degrade the bad file, keep the rest; report skips. |
| Status vocabulary drift — vault adds a new status, contract breaks | High | RESOLVED (§2): `status: z.string()` + UI neutral-badge fallback. Never throws. |
| Empty-string fields parsed as present (`last_sync: ""`) | Medium | Normalize `""` → `null` in repository before zod (A1); fields typed `.nullable()`. |
| Duplicate `path` (plugginsqlagent / dbcanvas) | Medium | List keys by `name`, never `path` (A3). Future drift check (S2+) must key by name. |
| Contract instability propagating to S2–S4 | Medium | Freeze `status` + `repo_url` here; architect-reviewer re-validates the contract in Phase 3. |
| `path` missing on disk treated as fatal | Low | §6: registry entry still returned; disk validation deferred to S2+. |
| Vault path misconfiguration silently yields empty list | Low | Distinguish unreadable (`VAULT_UNREADABLE` error) from genuinely empty (`empty: true`) — §6. |

## 10. Proposed Stories

**Recommendation: keep S1 as a SINGLE story (no BE/FE split).**

Justification:
- The vertical slice is small and tightly coupled through the contract change
  (`status`/`repo_url`); splitting risks the FE and BE diverging on the very
  field that just caused the GATE0 blocker.
- `parallel_implementation: true` in config permits a split, but the value of
  parallelism is low here (read-only, one endpoint, one list view + a placeholder)
  while the coordination cost of the contract edit is real.
- A single story lets the Phase 6.8 runtime smoke verify the full path
  (live registry → `/api/projects` → `/projects` grid → card → detail shell)
  in one pass.

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S1 | Registry reader (`GET /api/projects`) + `/projects` grid + detail route shell, incl. contract `status`→`z.string()` & `repo_url` | M | None (builds on arki/S12 assets) |

> If story-refiner finds the AC set too large for one story, the **only**
> acceptable split is BE-first then FE (BE depends on the contract edit; FE
> depends on BE), implemented **sequentially** with the contract edit landing
> first — never the contract field decided independently on each side.
