# Final Audit — REQ-20260624-S5a (RETRO Triage board + card detail, READ-ONLY)

> Story: **S5a** — the **read-only** half of S5 (split from S5b, which owns the
> write actions + corrected improvement-loop state machine + a dedicated Phase 5.5).
> Mode: **Reduced** — T3 combined Phase 1+2 (2nd successful use after S3),
> read-only ⇒ 2.5 folded into story Tests AC, 5.5 folded (no writes/subprocess/auth),
> 6.5/6.7 skipped (no migrations). Phases run: 1+2 (combined) → 3 → 4a → 4b →
> 5 → 6 → 6.8.

## 1) Summary

- **Total iterations:** LOW. Clean cycle — **no BLOCKER, no IMPORTANT** at any gate.
- **GATE0:** PASS, single pass, **proactive** (LL-010). No double-pass.
- **Architect (Phase 3):** APPROVED_WITH_MINOR (1 MINOR — escaped-pipe splitter →
  routed to a Phase-6 degrade test, documented not fixed; legitimate).
- **Code review (Phase 5):** APPROVED_WITH_MINOR — 3 MINORs (2× React-namespace
  type-import; 1× `RoutingBadge` duplication, LL-009). All fixed in Phase 6.
- **Tests:** 423 total (335 backend + 88 frontend). Smoke GREEN (board + detail,
  two-color routing visible: framework=gold / project=jade).
- **Main causes of (minimal) rework:** none preventable was missed at a *gate*;
  the only repeat-offender is the React-namespace type-import MINOR, now seen in
  **S4 + S5a** (2 cycles → crosses the recurrence bar). One genuinely *new* miss
  surfaced only at the 6.8 smoke: **date rendering** (verbose `Date.toString()` +
  a TZ off-by-one).
- **Estimated preventable iterations:** **0** loops this cycle (no gate re-pass).
  The two carryable signals (React-namespace recurrence, date-formatting) are
  cheap follow-ups, not rework loops.
- **Token cost:** **~431K** (rollup `430985`) across **6 subagent runs** — back in
  the **low band** for a read-only M cycle, consistent with the de-risking effect
  of the Rule-0 split.

## 2) Timeline of Rework

| Phase | Issue | Root Cause | Preventable? | Fix |
|-------|-------|-----------|--------------|-----|
| 0 (Rule 0) | Original S5 carried writes + a state machine + the first vault-write surface | Whole-S5 scope was L-class with a brand-new mutation risk class | N/A (a *win*) | **Split into S5a (read) + S5b (write).** De-risked the read board independently; S5b gets the full pipeline + dedicated 5.5. |
| 3 (architect) | Escaped-pipe splitter in table cells could mis-split | A GFM edge case (`\|` inside a cell) | No (genuine edge case) | Routed to a Phase-6 degrade test; documented, not fixed (acceptable — no live card uses it). |
| 5 (code review) | 2× React-namespace type-import (`React.KeyboardEvent`, `React.ReactNode`) | Habit: using the `React.X` namespace instead of named `import type {…} from 'react'` | **Partial** — caught at review every time, but it now **recurs (S4+S5a)** ⇒ should be a standing convention/check, not a per-cycle catch | Fixed in Phase 6 (named type imports). |
| 5 (code review) | `RoutingBadge` duplication | LL-009 (shared display mapping copied, not exported from owner) | Partial — LL-009 exists; one component still duplicated | Fixed in Phase 6 (export/reuse from owning component). |
| 6.8 (smoke) | `date` rendered via `Date` → verbose toString + TZ off-by-one (`2026-06-06` shows Jun 05) | Source is already `YYYY-MM-DD` (string, per contract `date: z.string()`), but the component coerced it to a `Date` for display | **Yes** — the contract/story explicitly said "NOT a Date"; the UI re-coerced it | New follow-up: render the `YYYY-MM-DD` string verbatim (no `new Date(...)`). Carry to S5b or a 1-line fix. |

## 3) Agent Findings

### po-analyst (T3 LITE_COMBINED — Phase 1+2)
- **What went RIGHT (PRAISE):** Exemplary combined pass. GATE0 PASS proactive
  (LL-010) — read the live store first, counted the distribution (1 real card,
  6 findings, `_TEMPLATE` present). Applied LL-008 across the board (routing /
  severity / status / decision all `z.string()`, no `z.enum`). Stated the GFM
  table-parse **mechanism exactly** (LL-011) — header-find, separator-skip,
  blank-row-skip, bold/backtick strip, short/long-row tolerance, stop condition —
  *and* the endpoint decision (single `GET /api/triage`, detail client-side, S1
  pattern). This is the LL-011/LL-012 thread (P3) **not recurring** — the parse
  mechanism was pinned, so the architect spent zero MINORs re-resolving it.
- **What failed:** Nothing at a gate. The only thing the spec could have caught
  earlier is the date-rendering issue: the contract correctly said
  `date: z.string()` "NOT a Date", but the story's frontend AC (F4/D1) didn't
  *explicitly* say "render the date string verbatim — do NOT `new Date(...)`".
  That omission left a reasonable-but-wrong fork open for the implementer.
- **Instruction update (project-layer):** see §5 — date-rendering note.

### architect-reviewer (Phase 3)
- **PRAISE:** Traced the parser line-by-line against the live card (bold/backtick
  decorations + the template blank row), froze `TriageFinding`/`TriageDoc`/
  `TriageListResponse`. Surfaced the one real edge (escaped-pipe splitter) and
  *routed it correctly* to a Phase-6 degrade test rather than blocking — good
  cost discipline. Added the defensive separator-skip note (skip only a *real*
  separator).
- **What failed:** Nothing. The escaped-pipe MINOR is a legitimate edge call,
  not a miss.

### backend-developer (Phase 4a)
- **PRAISE:** Implemented the frozen parse algorithm verbatim (frontmatter +
  table + rationale), per-doc degrade in the reader, `_*` exclusion. **Live-verified**:
  sie_v2 → 6 findings, `_TEMPLATE` excluded, `**framework**` bold stripped.
  `make lint+test` green. No fs-write/spawn (read-only posture intact).

### frontend-developer (Phase 4b)
- **PRAISE:** Board (flatten findings → `TriageCard` 240px) + detail from cache
  (no extra backend call, per REQ §4), two-color routing badge, loading/error/empty
  states, `SEVERITY_VARIANT_MAP`. +17 tests.
- **What failed (two MINORs, both fixed Phase 6):**
  1. **React-namespace type-import** (`React.KeyboardEvent` / `React.ReactNode`)
     instead of named `import type {…} from 'react'`. **This is the recurring
     one (S4 + S5a).** Honest note: the review catches it every time, but it
     should not need to.
  2. `RoutingBadge` duplication (LL-009) — the shared mapping/component was
     copied rather than imported from its owner.
- **Also:** the date-rendering coercion (`new Date(...)`) that the smoke caught.

### code-reviewer (Phase 5)
- **PRAISE:** Verified the parser is an exact match to the frozen algorithm
  (incl. the defensive separator-skip), confirmed fs-safety (read-only, no
  writes/spawn), and caught all 3 MINORs with **no BLOCKER/IMPORTANT**. Three
  consecutive-plus clean cycles in spirit (S2→S3→S5a clean; S4's BLOCKER was a
  genuine L-story defect).
- **Latency note (P1 carry):** 62 tool uses / ~6.1 min (`367953` ms). This is the
  pattern-detector's standing P1 (code-reviewer wall-time on larger stories).
  In-band on tokens (`79113`); wall-time is the only anomaly. The Rule-T1
  context-digest optimization is still **not applied** — carry.

### test-engineer + frontend-developer (Phase 6)
- **PRAISE:** +78 backend tests (triage 48, triageReader 17, integration 13);
  fixed all 3 MINORs (named type imports, `RoutingBadge` export/reuse).
  Documented the id-non-empty blank-row behavior (matches the frozen algo).
  423 total green.

## 4) Systemic Issues

- **T3 (combined Phase 1+2) — 2nd successful use** (after S3). For a read-only
  projection of vault markdown into a board+detail, the combined pass produced a
  GATE0-PASS REQ + a fully-frozen-able story in one shot, with the architect
  freezing without re-resolving any mechanism. T3 is now a proven default for
  read-only, S1-class surfaces.
- **Rule-0 split as risk management (a WIN, not an issue).** Splitting S5 into
  S5a (read) / S5b (write) isolated the **first vault-write surface** out of the
  cheap read cycle. S5a stayed in the low band and shipped clean; S5b inherits a
  frozen contract + a verified parser + a working board, and carries the real
  risk (state transitions, file mutation) into a full pipeline with a dedicated
  5.5. This is exactly the de-risking Rule 0 is for.
- **React-namespace type-import recurrence (S4 + S5a).** Crosses the 2-cycle
  recurrence bar. Per-cycle the code-reviewer catches it cheaply, but it is now a
  *pattern*, not a one-off — see §5 (recommend a project-layer review-check §8,
  not a new LL).
- **Date-from-external-source rendered raw (NEW).** The vault supplies `date` as
  `YYYY-MM-DD`; the contract preserves it as a string ("NOT a Date"); the UI
  re-coerced it to a `Date` and got a verbose string + a TZ off-by-one. Single
  occurrence so far — log it as a watch-item; if a 2nd external-date field is
  rendered raw-vs-coerced in a future cycle, promote to an LL.
- **P1 (code-reviewer wall-time)** and **P2 (`:5174` port collision)** — both
  standing pattern-detector items; neither blocked S5a. Carry.

## 5) Workflow Improvements (Concrete)

1. **Add a project-layer review-check §8 (frontend type-only imports).** The
   React-namespace import has now recurred (S4+S5a). Make it a one-line check
   rather than relying on the reviewer to re-notice it every cycle.
2. **Add a date-rendering note to the frontend conventions** (or the story
   template's "external-vocab" guidance): when a field is a date *string* from an
   external source (contract type `z.string()`), render it **verbatim** — never
   `new Date(...)` for display (avoids verbose toString + TZ off-by-one).
3. **Apply Rule T1 (context digest) to Phase-5** to attack P1 wall-time — still
   not done; carry from the pattern-detector pass.
4. **Keep T3 as the default** for read-only S1-class surfaces; keep splitting
   write+read scopes via Rule 0 when a new mutation risk class appears.

## 6) Patches Proposed

```
- Type: project-layer
- Target: .claude/project/review-checks/code-reviewer.md
- Change: Add "## 8. Frontend type-only imports [recurrence S4+S5a]
  React types must be imported by name as type-only — `import type { KeyboardEvent,
  ReactNode } from 'react'` — NEVER referenced via the `React.X` namespace
  (`React.KeyboardEvent`, `React.ReactNode`). Grep changed `.tsx`/`.ts` for
  `React\.[A-Z]` in type position; flag as MINOR. Rationale: appeared as a MINOR
  in S4 and S5a (2 cycles)."
```

```
- Type: project-layer
- Target: .claude/project/conventions/typescript.md  (or the frontend conventions file)
- Change: Add a "Rendering external date fields" note:
  "A field whose contract type is `z.string()` and whose value is an external
  `YYYY-MM-DD` (e.g. vault frontmatter `date`) is rendered VERBATIM as a string.
  Do NOT wrap it in `new Date(...)` for display — that yields a verbose toString
  and a timezone off-by-one (`2026-06-06` → 'Jun 05'). Found: S5a smoke."
```

```
- Type: project-layer (DEFER decision to user)
- Target: docs/process/lessons-learned.md
- Change: OPTIONALLY add LL-013 (date-from-external-source rendered raw). RECOMMEND
  NOT YET — single occurrence. Track as a §4 watch-item; promote to LL-013 only if
  a 2nd raw-vs-coerced external-date instance appears. (The React-namespace
  recurrence is better served by a review-check §8 than an LL, since it is a
  mechanical lint-style rule, not a root-cause lesson.)
```

**No framework patches proposed.** Both proposals are project-specific (React
usage style + this app's vault-date rendering); neither is a universal lesson.

## 7) Next-Requirement Guardrails (carry into S5b)

- **Mandatory pre-implementation checks:** S5b introduces **writes** to
  `<vault>/retro-triage/*.md` — run the **full pipeline + a dedicated Phase 5.5**
  (no folding). GATE0 must validate the *current* on-disk state of every doc it
  will mutate; the corrected improvement-loop state machine (`PendienteVerificación`
  → `Verificado` after K=2 clean cycles, spec §3) is **app-owned** ⇒ `z.enum`
  applies (the LL-008 exception: enum the states the app owns, mirror external
  vocab as `z.string()`).
- **Mandatory naming checks:** frontend type-only imports named, never `React.X`
  (new review-check §8).
- **Mandatory schema checks:** S5b extends the frozen S5a contract — re-freeze
  any new write-payload schema against the live store; do not loosen the
  permissive read fields.
- **Date rendering:** apply the new convention to any date displayed in S5b.
- **fs-safety:** S5b is the first writer — the code-reviewer fs-safety check
  (review-check §1) becomes BLOCKER-critical; verify writes are scoped to
  `retro-triage/*.md` + applied-patch targets only (per CLAUDE.md target
  architecture).

## 8) Token & Latency Telemetry

Ranked by `total_tokens` descending.

| Phase | Agent | Tokens | Tool uses | Duration | Produced | Notes |
|-------|-------|-------:|----------:|---------:|----------|-------|
| 6 | test-engineer + frontend-developer | 121,263 | 37 | ~7.5 min | +78 tests (423 total) + 3 MINOR fixes | Largest run; proportionate (parallel test-write + fix pass). |
| 5 | code-reviewer | 79,113 | 62 | ~6.1 min | APPROVED_WITH_MINOR (3 MINOR) | P1 carry: wall-time/tool-use high vs tokens; T1 digest not yet applied. |
| 4b | frontend-developer | 63,520 | 29 | ~3.8 min | board + detail + fetchTriage (+17 tests) | In-band. |
| 1+2 | po-analyst (T3 combined) | 59,266 | 16 | ~3.0 min | REQ + story (GATE0 PASS) | Efficient — combined pass, low tool count. |
| 3 | architect-reviewer | 55,108 | 14 | ~2.3 min | SCHEMA-FROZEN-S5a (1 MINOR) | Tight, line-by-line trace; lowest duration of the judgment agents. |
| 4a | backend-developer | 52,709 | 20 | ~2.8 min | parser + reader + service + route (live-verified) | In-band. |
| 6.8 | orchestrator (smoke) | 0 | 0 | 0 | SMOKE-S5a GREEN + screenshots | Browser smoke; surfaced the date follow-up. |

**Totals:** `430,985` tokens across **6** subagent runs (the 6.8 smoke is a
zero-token orchestrator step).

**Observations:**
- **Back in the low band.** S-by-S trend (comparable read-only S/M cycles):
  **S1 463K → S2 450K → S3 390K → S4 688K (L + dedicated 5.5 + BLOCKER loop) →
  S5a ~431K.** S5a returns to the S1–S3 band; the S4 spike was scope-driven (L,
  5.5, BLOCKER fix) and S5a confirms the trend reverts once scope normalizes.
  The Rule-0 split is the main reason S5a is cheap: the expensive write surface
  was carved off to S5b.
- **No run is disproportionate to its task.** The Phase-6 run is the largest
  because it bundles +78 tests with the 3 MINOR fixes; per-task it's reasonable.
- **P1 (code-reviewer wall-time) persists** — 62 tool uses is the highest of any
  run; the Rule-T1 context digest remains unapplied. This is the one consistent
  optimization left on the table.

**Optimization backlog** (carry into next cycle):
- [ ] Apply Rule T1 (pre-extracted context digest) to Phase-5 code-reviewer (P1).
- [ ] Add the `:5174 → BACKEND_PORT=5184` note to dev-README (P2, overdue 6 cycles).
- [ ] Add review-check §8 (React type-only imports) before S5b.
- [ ] Add the external-date rendering convention before S5b.

## 9) pattern-detector Status

- **Last run:** after S4 — `docs/process/RECURRING-ISSUES.md` (Pass 1, 5 RETROs
  analyzed). **Not due again now** (cadence: every ~5 RETROs / monthly; S5a is
  the 6th RETRO — one shy of the next batch, and the prior pass already set the
  next-run trigger at "after S5 or S6").
- **New inputs to feed the NEXT pattern-detector run (do not run now):**
  1. **React-namespace type-import recurrence** — now S4 + S5a (2 cycles). If the
     review-check §8 (proposed above) is applied, the next run should *confirm it
     suppresses recurrence* (effectiveness check, like LL-011/LL-012 for P3).
  2. **Date-from-external-source rendered raw** — new single-occurrence signal
     (S5a). Watch for a 2nd instance to decide LL-013.
  3. **P3 (mechanism-hedge) effectiveness** — S5a is a clean data point: LL-011
     was applied (parse mechanism pinned) and the thread **did not recur**. Feed
     this as positive evidence that LL-011/LL-012 are working.
  4. **P1 (code-reviewer wall-time)** — still open; another data point (62 tool
     uses) for the T1-digest decision.
  5. **T3 second success** + **Rule-0 split** — positive process patterns to log.

## Confidence: HIGH

All cycle artifacts read in full (telemetry with rollup, REQ, story, prior
RECURRING-ISSUES.md, lessons-learned LL-001..012, and the S4 RETRO for the
React-namespace continuity). Findings are grounded in explicit telemetry (token
counts, tool uses, durations), gate outcomes (GATE0 PASS, architect/code-review
verdicts, smoke GREEN), and a cross-cycle check of the React-namespace MINOR
(confirmed S4 line 128 + S5a Phase 5). Every finding has a preventability rating;
every section-6 patch has a path + exact text.

---

## Verdict (for the orchestrator)

- **(a) The S5 split:** **Correct and a clear Rule-0 win.** Splitting read (S5a)
  from write (S5b) isolated the first vault-mutation risk class, kept S5a in the
  low token band (~431K, no BLOCKER), and hands S5b a frozen contract + verified
  parser + working board. Record as a positive process pattern.
- **(b) New LL / review-check for the React-namespace recurrence:** **Yes — add a
  project-layer review-check §8** (mechanical type-only-import rule), **not a new
  LL**. It crossed the 2-cycle bar (S4+S5a) and is a lint-style rule, not a
  root-cause lesson. The date-formatting miss is **NOT yet** an LL — single
  occurrence; track as a §4 watch-item + add the rendering convention now.
- **(c) S5b readiness:** **Ready.** Inherits a frozen, live-validated contract +
  a tested parser/reader + a working board/detail. S5b must run the **full
  pipeline + dedicated Phase 5.5** (first writer), enum the **app-owned** state
  machine (LL-008 exception), apply review-check §8 + the date convention, and
  treat the fs-safety check as BLOCKER-critical.
