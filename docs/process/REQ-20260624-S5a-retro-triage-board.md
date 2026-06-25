# REQ-20260624-S5a: RETRO Triage board + card detail (READ-ONLY)

> **Combined Phase 1+2 (T3 LITE_COMBINED).** This REQ is the PO-analysis half;
> the story is in `docs/process/stories/REQ-20260624-S5a.md`. S5a is the
> **read-only** half of S5. All write actions (route / apply / defer, the
> improvement-loop state machine) are a separate follow-on story **S5b** and are
> OUT of scope here.

## Workflow Status
- [x] Phase 1: PO Analysis — COMBINED with Phase 2 (T3)
- [x] Phase 2: Story Refinement — COMBINED with Phase 1 (T3)
- [ ] Phase 2.5: Test Planning — SKIPPED (folded into story Tests AC; read-only projection, no state machine)
- [ ] Phase 3: Architect Review — RUNS (re-validate GATE0 + freeze contract before impl)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] Phase 5.5: Security Review — FOLDED (read-only; no writes/subprocess/auth surface). S5b will own a DEDICATED 5.5 (it introduces writes).
- [ ] Phase 6: Tests
- [ ] Phase 6.5/6.7: SKIPPED (no migrations; coverage validated inline)
- [ ] Phase 6.8: Runtime smoke (board renders live card + empty state)
- [ ] Phase 7: Final Audit

**Pipeline rationale:** S5a is a pure read-only projection of vault markdown into
a board + detail view — the same risk class as S1/S3/S4 (which all ran combined
1+2). It adds one new repository reader and one new endpoint family, no writes,
no subprocess, no auth. Phase 3 still runs because this freezes a NEW contract
(`TriageFinding`/`TriageDoc`) and a NEW parse mechanism (GFM table). The write
half (S5b) carries the real risk (state transitions, file mutation) and gets the
full pipeline including a dedicated 5.5.

## 1. Requirement Summary
Add a top-level **RETRO Triage** screen (route `/triage`, nav group MEJORAR) that
reads the vault triage store (`<vault>/retro-triage/*.md`) and renders a **board**
of triage findings plus a **card-detail** view. It is strictly READ-ONLY: it
observes the improvement-loop state (which findings exist, their routing,
severity, and status) — it performs no writes, no actions, and no state
transitions. It mirrors the S1/S3/S4 live-read pattern (fs-isolated repository →
domain parser → service → route → typed React page).

## 2. Scope

### In Scope
- New repository reader: list `<vault>/retro-triage/*.md`, **exclude** files whose
  name starts with `_` (the template), parse YAML frontmatter + the GFM findings
  table + capture the `## Decisions & rationale` prose.
- New domain parser: frontmatter → `TriageDoc` meta; GFM pipe-table → `TriageFinding[]`.
- New endpoint family (see §4) returning the board payload.
- New frontend route `/triage` using `AppShell` (active nav = "RETRO Triage").
- Board grid of `TriageCard`s — one card **per finding** across all real docs,
  each carrying its parent doc's project/date context.
- Card-detail view (panel or `/triage/:id`) = the full doc: frontmatter meta +
  all findings + the rationale prose.
- Two-color governance applied to **routing** (framework = gold, project = jade)
  via the existing `GovernanceBadge`.
- First-class empty state (no real cards), per-doc degraded states (malformed
  frontmatter / malformed table), and missing-directory handling.

### Out of Scope (→ S5b)
- Any write to `<vault>/retro-triage/*.md` or target files.
- Route / apply / defer / reject actions.
- The improvement-loop state machine and its transitions
  (`PendienteVerificación` → `Verificado` after K=2 clean cycles, spec §3).
- Imposing the corrected (richer) state enum — S5a displays whatever
  status/decision strings are present.
- Authoring new triage cards; pattern-detector integration.

## 3. Data contract — triage store

> `conventions.multi_tenant: false` → no tenant column. No database tables
> (`orm: none`); the **store is the vault filesystem**. The "table inventory" for
> this app is the **data-contract inventory** below.

### 3.1 Source files (verified against the live store, GATE0)
`<vault>/retro-triage/` today: **1 real card** (`2026-06-06-sie_v2.md`, 6 findings)
+ `_TEMPLATE.md` (excluded). Default vault `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`, overridable via `KURAKA_VAULT`.

Each real card = YAML frontmatter + a `# Triage …` heading + a `Source:` line +
a GFM **findings table** + a `## Decisions & rationale` prose section + an
optional `## Follow-up` checklist.

### 3.2 Frontmatter fields (the `TriageDoc` meta) — verified
| Field | Live type | Contract type | Nullability | Notes |
|-------|-----------|---------------|-------------|-------|
| `project` | string | `z.string()` | nullable | must match a `projects/<name>.md`; not validated in S5a |
| `source` | string | `z.string()` | nullable | free text (RECURRING-ISSUES or RETRO-id) |
| `date` | string `YYYY-MM-DD` | `z.string()` | nullable | mirrored verbatim, NOT coerced to Date |
| `decision` | string `pending\|applied\|rejected\|deferred` | `z.string()` | nullable | **externally-owned vocab → permissive [LL-008]** |
| `applied` | bool | `z.boolean()` | nullable | live uses `true/false` |
| `tags` | string[] | `z.array(z.string())` | default `[]` | never null |

### 3.3 Findings-table columns (the `TriageFinding`) — verified
Header row: `| # | Finding | Routing | Target file | Severity | Status |`
| Column | Live values | Contract field | Type | Nullability |
|--------|-------------|----------------|------|-------------|
| `#` | `P1`…`P6` (or `1`,`2`…) | `id` | `z.string()` | nullable (blank rows) |
| `Finding` | description (may contain commas, parens) | `finding` | `z.string()` | nullable |
| `Routing` | `framework` / `project` (live uses `**framework**` markdown bold) | `routing` | `z.string()` | nullable — **externally-owned [LL-008]** |
| `Target file` | backtick path | `target_file` | `z.string()` | nullable; strip backticks |
| `Severity` | `HIGH` / `MED` | `severity` | `z.string()` | nullable — **externally-owned [LL-008]** |
| `Status` | `applied` / `pending` | `status` | `z.string()` | nullable — **externally-owned [LL-008]** |

**LL-008 decision (GATE0):** `routing`, `severity`, `status`, `decision` are
ALL externally-owned vocabularies that can grow → typed `z.string()`, **NO
`z.enum`** in the contract. Map known values → UI badge variant at the component
layer with a neutral fallback for unknowns. The ONLY governance mapping is
`routing` → `framework`(gold)/`project`(jade), normalized at the component layer
(`framework` substring → framework, else project). Casing/snake_case mirrors the
source 1:1 (LL-007/LL-009).

### 3.4 Markdown-table parse mechanism (LL-011 — stated exactly, not hedged)
This is a NEW parse. The mechanism:
1. After frontmatter is stripped by `gray-matter`, scan the body lines for the
   **header row** matching the literal column set
   (`# | Finding | Routing | Target file | Severity | Status`) — locate it by the
   presence of the `Finding` and `Routing` header cells, case-insensitively
   trimmed.
2. **Skip the separator row** immediately after the header (the `|---|---|…` row;
   detect cells consisting only of `-`, `:`, and whitespace).
3. For each subsequent line that starts with `|`, split on `|`, drop the leading
   and trailing empty cells produced by the outer pipes, and `trim()` each cell.
4. **Skip placeholder/blank rows**: a row whose `finding` cell (and all cells) is
   empty after trimming is dropped (the template has blank rows like `| 2 | | | | | |`).
5. **Normalize cell decorations**: strip surrounding markdown bold (`**x**` → `x`)
   from `routing`/`severity`/`status`; strip surrounding backticks from
   `target_file`. Empty-after-normalize → `null`.
6. Map positional cells → the 6 `TriageFinding` fields by column order. If a row
   has fewer/more cells than the header, fill missing as `null` / ignore extras
   (degrade, never throw).
7. Stop at the first non-table line (blank line or next `##` heading) after the
   table body.

### 3.5 Rationale capture
Capture the text under the `## Decisions & rationale` heading (until the next
`##` heading or EOF) as a single `rationale: string | null` (raw markdown,
rendered as preformatted/markdown text in detail). `## Follow-up` is NOT parsed
in S5a (out of scope; observe-only of findings).

## 4. Affected Endpoints

| Method | Path | Action | Auth |
|--------|------|--------|------|
| GET | `/api/triage` | Board: all real docs + their findings + meta + rationale | None (local single-user) |

**Endpoint decision (mirrors the S1 rationale, GATE0):** Do **NOT** add a
separate `GET /api/triage/:id` for S5a. The store is tiny (1 doc, 6 findings;
template excluded). The list payload already contains every doc in full
(frontmatter + all findings + rationale), so the detail view is satisfied
client-side by selecting the doc by `id` from the already-fetched list — exactly
how S1 served detail data within the list response until a real need arose.
This avoids a second reader+route+contract for zero added data. The detail VIEW
may use a client route `/triage/:id` (where `:id` = filename slug, e.g.
`2026-06-06-sie_v2`) that reads from the cached list; no extra backend endpoint.
If S5b later needs per-doc server work (locking a doc for a transition), it adds
the `:id` endpoint then.

Response = `TriageListResponse` (see §3 / story). `id` per doc = filename minus
`.md` (e.g. `2026-06-06-sie_v2`).

## 5. Affected Services & Repositories

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/src/index.ts` | ALTER | add `TriageFinding`, `TriageDoc`, `TriageListResponse` (permissive strings; NO enum) |
| `backend/src/domain/triage.ts` | CREATE | pure parser: frontmatter→meta, GFM table→`TriageFinding[]`, rationale capture; never throws |
| `backend/src/domain/triage.test.ts` | CREATE | unit tests for the parser (header find, separator skip, blank-row skip, bold/backtick strip, short/long rows) |
| `backend/src/repositories/triageReader.ts` | CREATE | list `<vault>/retro-triage/*.md`, exclude `_*`, read+parse each; per-file degrade; dir-missing → `VaultUnreadableError` (reuse existing) |
| `backend/src/repositories/triageReader.test.ts` | CREATE | reader tests vs temp dir (exclusion, empty store, malformed file degraded) |
| `backend/src/services/triageList.ts` | CREATE | assemble `TriageListResponse` (`docs`, `empty`) |
| `backend/src/routes/triage.ts` | CREATE | `createTriageRouter({vaultRoot?})`; `GET /triage`; VAULT_UNREADABLE→500 |
| `backend/src/index.ts` | ALTER | mount triage router under `/api` |
| `frontend/src/api/triage.ts` | CREATE | `fetchTriage()` → parse with `TriageListResponse` |
| `frontend/src/routes/TriagePage.tsx` | CREATE | `AppShell` (active "RETRO Triage") + header + board grid + empty state |
| `frontend/src/routes/TriageDetail.tsx` | CREATE | detail view (panel or `/triage/:id`) from cached list |
| `frontend/src/components/TriageCard.tsx` | CREATE | 240px card: finding title + routing/severity badges + target-file |
| `frontend/src/components/AppShell.tsx` | ALTER | give "RETRO Triage" nav item `href: "/triage"` |
| `frontend/src/main.tsx` | ALTER | register `/triage` (and `/triage/:id` if route-based detail) |
| `frontend/src/components/TriageCard.test.tsx` | CREATE | render + badge-variant tests |

File paths follow the express + react layered profile already in use (S1–S4).

## 6. Dependencies
- The vault triage store (`<vault>/retro-triage/`). Resolved via the existing
  `KURAKA_VAULT` env (`backend/src/config/env.ts`).
- Existing components reused: `AppShell`, `GovernanceBadge`, `Badge`.
- Existing error type reused: `VaultUnreadableError`.
- `gray-matter` (already a backend dep) for frontmatter.
- No new external dependency. Markdown table parsing is hand-rolled per §3.4
  (no new lib) — consistent with the no-extra-deps posture.

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Freezing a guessed status/severity/routing enum that the live vocab outgrows (SCHEMA-FROZEN-S1 class crash) | High | LL-008: permissive `z.string()` everywhere; UI maps known→variant with neutral fallback. Validated against live card (GATE0). |
| Markdown-table parse brittle to bold/backtick decorations or blank template rows | Med | §3.4 mechanism: explicit strip of `**`/backticks, explicit blank-row skip, short/long-row tolerance; covered by domain tests. |
| Including `_TEMPLATE.md` as a real card | Med | Exclusion rule: skip any file whose basename starts with `_`. Reader test asserts it. |
| Empty store today (1 real card) → empty board looks broken | Med | First-class empty state (`empty: true` hint, api-contract §"Empty is not an error"). |
| A single malformed doc breaks the whole board | Med | Per-doc degrade in the reader (skip/partial + stderr log), mirroring `projectRegistry` per-file skip; never 500 on one bad file. |
| Misreading routing→governance color (framework should be gold) | Low | Component normalizes: `routing` containing "framework" → framework(gold); else project(jade). Tested. |
| Scope creep into S5b (actions) | Low | This REQ explicitly fences writes/state-machine to S5b. |

## 8. GATE0 — proactive live-data validation result (LL-010)
**Performed BEFORE writing this REQ.** Read the live store directly:
- `ls <vault>/retro-triage/` → `2026-06-06-sie_v2.md` + `_TEMPLATE.md` (confirmed
  the `_` exclusion target exists).
- `cat 2026-06-06-sie_v2.md` → confirmed frontmatter fields
  (`project, source, date, decision, applied, tags`) and the findings-table
  columns (`# | Finding | Routing | Target file | Severity | Status`), the
  `**framework**` bold decoration, backtick target paths, and the
  `## Decisions & rationale` section.
- `cat _TEMPLATE.md` → confirmed blank placeholder rows (`| 2 | | | | | |`) that
  the parser must skip.

**Resolved decisions (no blocker):**
1. Contract vocab fields (`routing/severity/status/decision`) → permissive
   `z.string()`, NO enum [LL-008]. ✔
2. Endpoint: single `GET /api/triage` (list carries full docs); detail rendered
   client-side; no `:id` backend endpoint in S5a (S1-style decision). ✔
3. Parse mechanism: GFM pipe-table per §3.4, stated exactly [LL-011]. ✔
4. `_TEMPLATE.md` (and any `_*`) excluded by the reader. ✔
5. Empty/degraded handling: empty store → `empty:true`; bad doc → per-doc
   degrade; missing dir → `VaultUnreadableError`→500. ✔

No genuine blocker found → proceeded.

## 9. Proposed Stories
| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S5a | RETRO Triage board + card detail (READ-ONLY) | M | S12 (design system), AppShell/GovernanceBadge (S2) |
| S5b | RETRO Triage actions + improvement-loop state machine (WRITE) | L | S5a, dedicated Phase 5.5 |
