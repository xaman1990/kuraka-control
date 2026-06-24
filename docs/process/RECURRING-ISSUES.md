# Recurring Issues Report — Pattern Detector Pass 1

**Generated:** 2026-06-24  
**RETROs analyzed:** 5 (S12 2026-06-12 → S4 2026-06-24)  
**Cycles:** REQ-20260612-S12-design-system, REQ-20260620-S1-registry-reader-projects, REQ-20260622-S2-project-detail-drift, REQ-20260622-S3-project-config-tab, REQ-20260624-S4-project-layer-browser

---

## Executive Summary

- **Total findings across 5 RETROs:** 26 distinct issues (categorized as systemic, MINOR, process, debt)
- **Recurring patterns (2+ occurrences):** 6 confirmed
- **Threshold-crossing patterns (3+ occurrences):** 3 confirmed
  1. **code-reviewer wall-time latency** (3 of 5 cycles — S1, S3, S4 slow; S2 in-band; S12 N/A as reduced)
  2. **`:5174` Vite port collision** (5 consecutive cycles — S12, S1, S2, S3, S4)
  3. **Standing unfulfilled follow-ups** (3+ cycles overdue — vault `VERSION` file, sidebar prefix-match, dev-README `:5174` note)
- **Estimated preventable rework:** ~1 loop from GATE0 (S1; contained by LL-007/LL-010). S2→S4 clean. Mechanism-hedge pattern recurs in S2+S3, partially addressed by LL-011, then LL-012 added for the non-obvious platform-fact-gated fork in S4.
- **Positive pattern:** the improvement loop is **self-reinforcing** (lessons applied → S1→S2→S3→S4 tokens trend 463K→450K→390K→688K(scope), zero GATE0 double-passes S2 onward, three consecutive clean cycles S1→S3).

---

## Pattern Summary Table

| ID | Signature | Cycles seen | Frequency | Severity | Status | Patch type |
|:---|-----------|:------------|:---------:|:--------:|:------:|-----------|
| **P1** | code-reviewer wall-time (S1~25m, S3~58.5m, S4~54m; S2~5.2m) | S1, S3, S4 | 3/5 = 60% | MEDIUM (latency, not correctness) | **OPEN — backlog** | project-layer / orchestrator practice (Rule T1) |
| **P2** | `:5174` Vite port collision resolved via `BACKEND_PORT=5184` | S12, S1, S2, S3, S4 | 5/5 = 100% | LOW (cosmetic, known workaround) | **OPEN — overdue** | doc (one-liner dev-README) |
| **P3** | Mechanism-hedge thread (story leaves parse/compare/curate fork implicit) | S2 (2 MINORs), S3 (1 MINOR), S4 (1 BLOCKER) | 3 cycles, 4 instances | LOW (resolved in-freeze, but recurs) | **MITIGATED by LL-011; LL-012 added** | project-layer (lessons; LL-011 + LL-012) |
| **P4** | arki bootstrap gaps (eslint config, createApp factory, enum guessing) | S12 (eslint), S1 (eslint + createApp + enum) | 2 cycles, 3 instances | MEDIUM (pre-existing, fixed in-repo) | **CLOSED for kuraka-control** | project-layer (applied S1 RETRO); framework recommendation |
| **P5** | Vault `VERSION` file missing (regex scrape fragility) | S2 (Systemic #1), S3 (carry), S4 (carry) | 3 cycles identified | LOW (contained correctly, deferred) | **OPEN — standing debt** | project-layer (story backlog) |
| **P6** | Sidebar active-nav exact-match (not highlighted on `:name` detail) | S2 (code-review SUGGESTION), S3 (carry), S4 (carry) | 3 cycles identified | LOW (cosmetic) | **OPEN — standing debt** | project-layer (story backlog) |

---

## Top Patterns (Recurring)

### Pattern 1: code-reviewer wall-time latency (P1)

- **Occurrences:** 3 (S1, S3, S4)
- **Frequency:** 3 of 5 cycles = 60% (the three largest stories)
- **Symptoms:**
  - S1: code-reviewer ~25 min (~1,484 s) for 70K tokens / 77 tool uses
  - S3: code-reviewer ~58.5 min (~3,512 s) for 74K tokens / 61 tool uses
  - S4: code-reviewer ~54 min (~3,239 s) for 88K tokens / 66 tool uses
  - S2: code-reviewer ~5.2 min (~312 s) for 76K tokens / 80 tool uses — **in-band**
  - Tokens stay proportionate every cycle; wall time is the sole anomaly
- **Root cause:** many sequential small file reads + grep operations. The reviewer cannot batch reads as effectively when it must context-switch between the frozen schema, changed-file lists, and specific invariants to verify.
- **Agent consistently responsible:** code-reviewer (direct); **should prevent:** orchestrator (Rule T1 optimization not yet applied)
- **Structural fix (Rule T1):** feed the code-reviewer a **pre-extracted context digest** at Phase 5 startup:
  - The frozen schema (contracts, decision tables, biconditionals, SEC# invariants)
  - The list of changed files with line counts
  - The specific invariants to verify (e.g., "exact conformance to SCHEMA-FROZEN-S4 §1")
  - For security reviews (5.5), the SEC# checklist with "where" locations
- **Where:** orchestrator practice / `.claude/skills/kuraka.md` Phase-5 prompt template (project-layer refinement, or an orchestrator hand-off habit)
- **Priority:** **HIGH** — now 3 of 5 cycles slow, including the new 5.5 security-reviewer (~48 min first run); estimated 20–30 min recovery per cycle if context digest is applied
- **Already mitigated?** No. This is a standing backlog item mentioned in S1, S3, S4 RETROs but not yet implemented.

### Pattern 2: `:5174` Vite port collision (P2)

- **Occurrences:** 5 (S12, S1, S2, S3, S4)
- **Frequency:** 5 of 5 = 100% — **every cycle**
- **Symptoms:** Vite dev server collides with an unrelated project on `localhost:5174`; resolved by setting `BACKEND_PORT=5184` (Express and the Vite proxy already read this env var — no source change needed)
- **Root cause:** environment friction, not a code defect. The machine has another project using `:5174`.
- **Structural fix:** one-line note in **dev-README** documenting the collision + the override so the next operator doesn't re-debug it
- **Where:** `docs/README-dev.md` or backend startup docs
- **Priority:** **MEDIUM** — affects every dev session, but a one-liner fix is overdue
- **Already mitigated?** No. S1 and S2 RETROs explicitly recommended this; it has been carried unchanged for 5 cycles.

### Pattern 3: Mechanism-hedge thread (P3)

- **Occurrences:** 3 cycles, 4 instances (S2 2 MINORs, S3 1 MINOR, S4 1 BLOCKER)
- **Frequency:** 3 of 5 cycles; 4 out of 26 total findings = recurring defect-adjacent signal
- **Symptoms:**
  - **S2:** story hedged lock-parse (yaml vs JSON) and version-compare (segment vs string) as "Technical Notes" → 2 architect MINORs resolved in-freeze
  - **S3:** story stated "permissive typing + do not coerce" in prose but left the type-strict mechanism implicit → 1 architect MINOR resolved in-freeze
  - **S4:** story pinned the 6-step containment algorithm exactly (LL-011 applied correctly) but left the tree-walk symlink classification implicit → 1 BLOCKER (symlink double-emit on Node 22)
- **Root cause:** the story-refiner / po-analyst (in T3 combined mode) leaves algorithm/mechanism choices as prose hedges when >1 reasonable implementation exists
- **Pattern nuance (important for LL-012 vs LL-011):**
  - S2 + S3 instances are **obvious forks** (yaml-vs-JSON, segment-vs-string, reject-vs-coerce) — covered by LL-011, which states the resolved decision in the AC, not a hedge
  - S4 instance is a **non-obvious, platform-fact-gated fork** (Node-22 symlink dirent semantics) — requires platform knowledge to see the fork at all; LL-011 doesn't reach it; LL-012 added to cover it
- **Structural fix:** 
  - **LL-011** (project-layer, already in lessons-learned.md as of this report) — story-refiner states the resolved mechanism for any parse/compare/curate step with >1 obvious implementation
  - **LL-012** (project-layer, new — proposed in S4 RETRO) — for fs-walks that classify entries, specify symlink handling explicitly (stat/lstat, never dirent type bits) and state the symlink-dir follow/no-follow policy in the freeze; add to code-reviewer review-checks
- **Where:** `docs/process/lessons-learned.md` (LL-011 already there; LL-012 needs to be added) + `.claude/project/review-checks/code-reviewer.md` (new fs-walk symlink check)
- **Priority:** **MEDIUM** — per-instance is cheap (resolved in-freeze, no rework), but crosses 2-RETRO recurrence bar → now worth a lesson to suppress recurrence
- **Already mitigated?** Partially. LL-011 was written and applied in S4's resolver (visible win); S4 still leaked on the walk (LL-012 needed).

### Pattern 4: arki bootstrap gaps (P4)

- **Occurrences:** 2 cycles (S12, S1)
- **Frequency:** 2/5 cycles, but 3 instances (eslint config S12+S1, createApp factory S1, enum guessing S1)
- **Symptoms:**
  - S12: ESLint v9 installed with no `eslint.config.js` (flat config)
  - S1: Backend has no `eslint.config.js`; backend lacks `createApp()` factory (index.ts is side-effecting bootstrap); `status` enum guessed without validating against live data
- **Root cause:** arki (greenfield bootstrap) seeded an incomplete frontend and backend scaffold; did not validate contract fields against live data
- **Structural fix (framework, but applied as project-layer for kuraka-control):**
  - Seed an `eslint.config.js` for every workspace (frontend, backend) at bootstrap
  - Export a pure `createApp()` factory from backend `index.ts` (so `index.ts` just calls `createApp().listen()`)
  - Do not enum externally-owned contract fields; validate against live data first (LL-007 / LL-008)
- **Where:** framework (arki agent prompt); already applied as project-layer follow-ups in S1 RETRO
- **Priority:** **MEDIUM (framework) / CLOSED (kuraka-control)** — for kuraka-control, the S1 RETRO applied all three as project-layer follow-ups and **S2→S4 do not recur** (`make lint` green, integration tests against real app). The framework recommendation still stands for **other** projects using arki.
- **Already mitigated?** Yes, for kuraka-control (applied S1 RETRO). No framework patch has been applied yet; recommendation is to escalate to arki upstream for all future projects.

### Pattern 5: Vault `VERSION` file fragility (P5)

- **Occurrences:** 3 cycles identified (S2, S3, S4)
- **Frequency:** 3/5 cycles noted in RETROs as a carry-forward debt
- **Symptoms:** The vault-current version is scraped via anchored regex from `kuraka-init.py:41` (`DEFAULT_VERSION = "0.3.4"`). No canonical machine-readable `VERSION` file in vault root.
- **Root cause:** the vault has no structured version file; the backend must regex-parse source code
- **Structural fix:** create a canonical `VERSION` (or `kuraka.lock`) file in the vault root with the current version; backend reads it instead of regex-scraping
- **Where:** vault (not kuraka-control project) — **carries to orchestrator** as a vault-maintenance task; S4 RETRO recommends scheduling it as a formal story
- **Priority:** **LOW** (already contained correctly with `unknown` fallback; not blocking; deferred intentionally)
- **Already mitigated?** Partially (contained by the `unknown` fallback); not a blocker. Recommended for formal story in next vault-maintenance cycle.

### Pattern 6: Sidebar active-nav exact-match (P6)

- **Occurrences:** 3 cycles identified (S2, S3, S4)
- **Frequency:** 3/5 cycles noted as a standing UI debt
- **Symptoms:** Sidebar "Proyectos" is highlighted only when the exact path matches; not highlighted on `/projects/:name` detail pages (should use prefix-match)
- **Root cause:** simple nav logic (exact-match instead of prefix-match)
- **Structural fix:** change sidebar active-nav logic from exact-path match to prefix-match; batch into next UI-touching story
- **Where:** `.claude/project/` as a story-backlog item (cheap, batchable)
- **Priority:** **LOW** (cosmetic, deferred intentionally)
- **Already mitigated?** No (standing debt).

---

## Evidence of Improvement Loop (Positive Pattern)

The improvement loop is **self-reinforcing** and measurable:

### Token trend (scope-adjusted)
- **S1 → S2 → S3 (comparable S/M read-only stories):** 463K → 450K → 390K (−3% → −13%, monotonic decline)
  - S1 burned a ~40K GATE0 BLOCKED double-pass + Phase-5 CHANGES_REQUIRED loop
  - S2 traded both for clean GATE0 PASS + APPROVED review (same budget, cleaner cycle)
  - S3 further applied Rule T3 (combined 1+2) + pattern reuse → lowest token cost
- **S4 (L-complexity, +dedicated 5.5):** 688K (+58% vs S3, +49% vs S1)
  - Scope-driven increase (three independent multipliers: L complexity, dedicated 5.5, BLOCKER fix loop)
  - Per-run tokens stayed in-band; the increase is legitimate
  - Benchmark S4 against itself, not against S1–S3

### GATE0 performance
- **S1:** GATE0 BLOCKED → rewrite (arki enum contradiction)
- **S2 onward:** GATE0 PASS single-pass (LL-010 proactive validation applied)

### Phase-5 review outcomes
- **S1:** CHANGES_REQUIRED loop
- **S2 → S4:** APPROVED or APPROVED_WITH_MINOR (three consecutive clean cycles; S4's BLOCKER was a genuine correctness defect on an L story, not a regression)

### Lessons being applied
- **LL-007/LL-008/LL-010** cited in S2 + S3 + S4 artifacts
- **LL-011** applied correctly to S4's resolver (the obvious fork); S4 later codified LL-012 for the non-obvious fork
- **Pattern reuse** (S2 fs-safe-read → S3/S4 inherit the template; no reinvention)

---

## Non-Patterns (single occurrence, low priority)

1. **S12 rules-16 vault-sync incident** — subagent autonomously ran `rsync --delete` into a shared vault path, wiping another project's docs. Preventable by guard. Applied as Patch A (project-layer append to every doc-writing agent), already implemented.
2. **S1 detail-shell layout deferred** — correctly deferred; extracted in S2 (SUGGESTION-9 closed).
3. **S2/S3 design-token gap** — `--radius-card` referenced before definition. Converted to a review-check, not an LL (project-specific, mechanical).
4. **S4 Windows-drive traversal bypass** — caught at the architect freeze (SEC2); zero rework cost. Not a process failure.

---

## Proposed Changes

### Patch Summary

**Ranking by priority + impact:**

| # | File | Change Type | Description | Type | Priority |
|---|------|-------------|-------------|------|----------|
| 1 | `docs/process/lessons-learned.md` | Add lesson | Add **LL-012** — fs-walk entry classification must specify symlink handling explicitly; dirent type bits insufficient for symlinks on Node 22 (found in S4 BLOCKER) | project-layer | HIGH |
| 2 | `.claude/project/review-checks/code-reviewer.md` | Add rule | Add fs-walk symlink check: verify classification by `stat`/`lstat`, never dirent bits; confirm symlink-dir follow/no-follow policy explicit | project-layer | HIGH |
| 3 | orchestrator practice (Rule T1) | Optimization | Feed code-reviewer a pre-extracted context digest (frozen schema + changed-file list + SEC invariants) at Phase 5 startup to cut wall time (from 54 min → target ~10 min) | project-layer / orchestrator | **HIGH** |
| 4 | `docs/README-dev.md` (or dev startup docs) | Doc | Add one-liner: "Vite `:5174` may collide with an unrelated project; if so, set `BACKEND_PORT=5184`" (both Express and Vite proxy already read this env var) | doc | MEDIUM |
| 5 | `.claude/project/` story backlog | Story | Schedule "Land vault VERSION file" — stop regex-scraping `kuraka-init.py`; create canonical `VERSION` in vault root (low-priority, clean deferred) | project-layer | LOW |
| 6 | `.claude/project/` story backlog | Story | Schedule "Sidebar active-nav prefix-match" — so "Proyectos" highlights on `/projects/:name` details (cosmetic, batchable, clean deferred) | project-layer | LOW |
| 7 | arki agent prompt (framework) | Agent patch | Seed `eslint.config.js` per workspace; export `createApp()` factory from backend; do not enum externally-owned fields (validate live-data first) | **framework** | MEDIUM (other projects) / CLOSED (kuraka-control) |

---

## Framework vs. Project-layer Breakdown

### Framework patches (require vault + human confirm)

1. **arki** (Patch 7): seed eslint + createApp + enum validation
   - **Status for kuraka-control:** already applied as project-layer follow-ups (S1 RETRO)
   - **Status for other projects:** stands as a recommendation; pattern-detector should confirm it against other projects' RETROs

### Project-layer patches (in-repo, safe)

1. **LL-012** (Patch 1) — add to `docs/process/lessons-learned.md`
2. **code-reviewer review-check** (Patch 2) — add to `.claude/project/review-checks/code-reviewer.md`
3. **Rule T1 context digest** (Patch 3) — orchestrator practice (refine how Phase-5 reviewers are invoked)
4. **Dev README note** (Patch 4) — one-liner doc addition
5. **Story backlog items** (Patches 5–6) — schedule cheap, deferred debts

---

## Confidence: HIGH

All 5 RETROs were read in full. Patterns were grounded in:
- Explicit telemetry (token counts, wall times, tool uses)
- Gate outcomes (GATE0 PASS/BLOCKED, Phase-5 review verdicts, smoke results)
- Agent findings sections (root causes, preventable assessments)
- Cross-cycle notes in each RETRO identifying patterns
- Lessons-learned.md (LL-001 through LL-011, with LL-012 proposed)

The code-reviewer latency (P1), port collision (P2), and mechanism-hedge thread (P3) all crossed the 2+ occurrence bar. The arki gaps (P4) crossed the 2-occurrence bar and were confirmed closed for kuraka-control via project-layer follow-ups. The standing debts (P5, P6) are explicitly acknowledged as non-blocking carries across 3 cycles.

---

## Recommendations for Next Steps

1. **Before the next `/kuraka` cycle:**
   - Apply LL-012 to `lessons-learned.md` (new lesson)
   - Add fs-walk symlink check to code-reviewer review-checks
   - Add the `:5174` note to dev-README

2. **In the next 2 cycles (S5–S6):**
   - Apply the context-digest optimization (Rule T1) to Phase-5 reviewers
   - Verify the mechanism-hedge thread does not recur now that LL-011+LL-012 are in place

3. **Standing (no blocking):**
   - Schedule vault VERSION file + sidebar prefix-match stories when convenient
   - Confirm arki upstream patch recommendation with other projects' pattern-detector passes

4. **Pattern-detector next run:**
   - After S5 or S6 (next 5-RETRO cadence or ~monthly)
   - Inputs: code-reviewer latency (after T1 optimization applied), mechanism-hedge recurrence check (LL-011+LL-012 effectiveness), arki gaps confirmation for other projects
