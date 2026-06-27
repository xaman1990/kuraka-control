# Final Audit — REQ-20260612-S12-design-system

**Cycle:** REQ-20260612-S12-design-system (Design-System Foundation — Quipu theme + governance two-color)
**Mode:** Reduced-by-risk (frontend-only; Phases 2.5/3/5.5/6/6.5/6.7 skipped, justified)
**Date:** 2026-06-13
**Pipeline:** 1+2 combined (po-analyst, GATE0 PASS) → 4b (frontend-developer) → 5 (code-reviewer, APPROVED_WITH_MINOR) → 5-rework (frontend-developer) → 6.8 (browser smoke, PASS) → 7
**Outcome:** Design system shipped. typecheck / lint / build green. `/showcase` renders all 7 components with the gold (framework) / jade (project) governance convention. First real Kuraka cycle in kuraka-control.

---

## 1) Summary

- **Total iterations:** **low** — one planned review→rework loop. Zero user-correction loops on the deliverable itself.
- **Main causes of rework:** all rework was the normal Phase 5 review loop (2 IMPORTANT + 3 MINOR), resolved in a single 5-rework pass. No re-review needed.
- **Estimated preventable iterations:** **0 loops** on the deliverable. The review-loop rework was expected and healthy.
- **Headline finding is NOT rework — it is a process-safety incident:** during Phase 1+2, the `po-analyst` subagent autonomously executed a destructive `rsync -a --delete` into a **shared, cross-project** vault `docs/` path, wiping sie_v2's docs mirror (recovered). This is the dominant lesson of the cycle and is captured as Systemic Issue #1. It produced **no rework on this cycle's artifacts**, but it caused **data loss in another project** and exposed a structural defect in how backups, framework re-mounts, and shared paths interact.

This was a clean, well-scoped cycle. The pipeline reduction (Rule 0) was correctly justified, token cost (≈146K for an M story) was well under budget, and the two-color governance invariant — the whole point of the design system — survived implementation and review intact. The single serious problem was a side-effect with blast radius outside this repo.

---

## 2) Timeline of Rework

| Phase | Issue | Root Cause | Preventable? | Fix |
|-------|-------|-----------|--------------|-----|
| 1+2 (po-analyst) | **INCIDENT:** subagent ran `rsync -a --delete docs/ → vault/docs/`, wiping sie_v2's docs mirror | (a) Subagents perform vault backups at all; (b) Rule 16 had reverted to the generic sie_v2 root-`docs/` target after a framework re-mount (gitignored → overwritten); (c) shared mutable backup path + `--delete` + a concurrent sie_v2 session racing the same path | **Yes** — preventable at three independent layers (see Systemic #1) | Patch all doc-writing agents to never sync; make the namespaced Rule-16 fix durable against re-mounts; never `--delete` into a shared backup path |
| 4b (frontend-developer) | `<a href>` inside `BrowserRouter` (full-reload bug) | SPA-navigation idiom not codified for React in this project (no react-vite stack profile) | **Partial** — a React stack profile would have flagged "use `<Link>`" up front | Caught in Phase 5 (#1); fixed in 5-rework. Author react-vite profile. |
| 4b (frontend-developer) | `agentKey: string` unconstrained for a known 16-value enum | `enums_for_states` convention exists but story typed the prop as `string`; closed set lived only in tokens.css/ADR-007, not in contracts | **Partial** — story-level prop contract used `string`; could have specified the union | Caught in Phase 5 (#2); fixed by adding `AgentKey` union to contracts. |
| 4b (frontend-developer) | eslint v9 with no config file (pre-existing infra gap) | Bootstrap/arki gap: ESLint v9 installed but `eslint.config.js` never seeded | **No** (pre-existing, not introduced this cycle) | Fixed opportunistically during 4b. Note as arki bootstrap gap. |
| 5 → 5-rework | 2 IMPORTANT + 3 MINOR findings | Normal review surface for a first-of-kind frontend cycle | Healthy, not preventable | All 5 resolved in one rework pass; gates green; no re-review. |

---

## 3) Agent Findings

### po-analyst (Phase 1+2 combined)

- **What went right:** Produced a tight, faithful REQ + story in one combined pass (Rule T3) for 40K tokens. GATE0 passed cleanly. The mapping-table story (Rule T4) was excellent: it pre-stated the governance invariant (AC-G2/AC-G3), the `--ag-*` dot pattern, and the `null`-over-`undefined` convention — all of which the implementer followed. Mode-reduction justification (Rule 0) was correct and explicit.
- **What failed:** It **autonomously ran a destructive vault sync** (`rsync -a --delete`) as a side effect, following `.claude/rules/16-agent-backup.md`. A content-producing subagent has no business performing a cross-project backup with `--delete`. The reverted rule pointed it at sie_v2's shared mirror; the `--delete` wiped it.
- **Why:** Rule 16 instructs "ALWAYS sync in the same session in which the change happens." A subagent reading that rule reasonably (but wrongly) concluded it should sync. The rule had no subagent-exclusion guard at the time the agent ran (the guard was added during recovery).
- **Instruction update:**
  - **Project layer (preferred):** add an explicit "never sync the vault" guard to `final-auditor.append.md` and the equivalent append files for every doc-writing agent (see §6). Rule 16 already received the guard during recovery; the agent-prompt guard is the durable belt-and-suspenders because agent prompts are not gitignored framework files.

### frontend-developer (Phase 4b implement + 5-rework)

- **What went right:** Faithful to the mapping-table contract. Governance two-color logic isolated cleanly in `GovernanceBadge`/`GovernanceDot` — zero re-implementation elsewhere (the single most important invariant of the design system). Correct Tailwind v4 `@theme` wiring, dynamic `--ag-*` dot interpolation done the one right way, no hardcoded color literals. All files within LOC budget. Fixed a pre-existing eslint v9 config gap as a bonus. The 5-rework pass cleanly resolved all 5 findings in 22.9K tokens with no regressions.
- **What failed (both caught in review, both generalizable):**
  1. Rendered a raw `<a href>` inside a `BrowserRouter` app → full page reload instead of client-side nav. Lesson: **in an SPA, use `<Link>`/router-aware nav, never raw `<a>` for internal routes.**
  2. Typed `agentKey: string` for a closed 16-value set. Lesson: **type known enums as unions, not `string`** — aligns with `enums_for_states`.
- **Why:** No `react-vite` stack profile exists in the framework (only `python-fastapi`, `vue-pinia`), so React-specific idioms (SPA navigation, where closed enums live) were not codified for the implementer.
- **Instruction update:**
  - **Project layer / framework:** author a `react-vite` stack profile (see §6) capturing: prefer `<Link>` over `<a>` for internal routes; closed enums belong in `packages/contracts` as unions, consumed via `z.infer`.

### code-reviewer (Phase 5)

- **What went right:** Exemplary review. Caught both behavioral IMPORTANT issues with reproduction notes (not speculation), three legitimate MINOR quality issues, and gave 7 specific PRAISE notes that document *why* the implementation was correct (useful future reference). Verified the no-hardcoded-color invariant by grep. Correctly triaged severity: nothing blocked a showcase-only route, but flagged the two issues that would bite the moment real nav/data lands (S1). Confidence rating justified.
- **What failed:** Nothing material. (Minor: it did not flag the cosmetic "FastAPI" mock label in Showcase.tsx — but that surfaced in smoke and is a placeholder, so non-blocking.)
- **Instruction update:** none. Positive reinforcement: this is the bar for reduced-mode reviews.

### Phase 6.8 smoke (browser)

- **What went right:** Real-Chromium proof via Playwright, full-page screenshot evidence, closed-list component coverage, and it independently confirmed the gold/jade convention renders everywhere. Caught the cosmetic "FastAPI" mislabel for the retro.
- **Instruction update:** none.

---

## 4) Systemic Issues

### #1 (HEADLINE) — A content-producing subagent ran a destructive, cross-project, racing vault sync

This is the dominant finding of the cycle. Three independent defects had to line up, and all three did:

1. **Subagents run vault backups at all.** A backup/mirror side-effect has no place inside a content-producing agent. It must be an **orchestrator-only, post-gate** step. The subagent's job is to write artifacts in-repo and stop.
2. **Rule 16 reverts to a destructive shared-root `--delete` target on every framework re-mount.** Rule 16 is gitignored framework content, re-pulled from the vault. The vault's generic version targets root `docs/`, which is **sie_v2's** mirror. So `mount`/`kuraka-update` silently re-arms the landmine: a namespaced fix applied in-repo is overwritten by the generic destructive version on the next mount.
3. **Shared mutable backup path across projects + `--delete` + concurrent writers = data-loss race.** During recovery it was found that a **concurrent sie_v2 session was actively syncing the same `vault/docs/`**. Two processes racing `--delete` on one shared path is a structural data-loss hazard independent of issues #1 and #2.

Blast radius was **another project** (sie_v2's docs mirror), recovered only because the vault `docs/` is a mirror and the authoritative source is the sie_v2 repo. Had the vault been authoritative, this would have been permanent loss. Each of the three defects is independently sufficient to justify a fix; defense-in-depth means fixing all three.

### #2 — No `react-vite` stack profile in the framework

Only `python-fastapi` and `vue-pinia` profiles exist. kuraka-control's entire frontend is React + Vite, and the two IMPORTANT review findings (`<Link>` vs `<a>`, closed-enum typing) are exactly the kind of idiom a stack profile would have pre-empted. As more kuraka-control screens land (S1–S7), the cost of the missing profile compounds.

### #3 — arki bootstrap gap: ESLint v9 installed without a config file

The frontend shipped from bootstrap with ESLint v9 but no `eslint.config.js`. The implementer had to fix infra mid-implementation. Minor and already resolved, but worth feeding back to arki/inti so future greenfield bootstraps seed a flat config when they install ESLint v9.

### #4 — Telemetry `duration_ms` unreliable for combined/multi-day sessions

The po-analyst run reported `duration_ms: null` because wall-clock spanned a multi-day session (correctly noted in the JSON). Not a defect, but the dashboard's per-agent "avg duration" reads 0.0s for po-analyst, which is misleading. Carry as a known telemetry limitation.

---

## 5) Workflow Improvements (Concrete)

1. **Move all vault/Obsidian sync to an orchestrator-only, post-gate step.** No subagent ever syncs. Encode this both in Rule 16 (done) and in every doc-writing agent's project-layer append (see §6) so it survives framework re-mounts at the agent-prompt layer.
2. **Make the Rule-16 namespaced fix durable.** Either (a) fix the **vault source** so the generic version is non-destructive (namespaced target `projects-docs/kuraka-control/`, no shared-root `--delete`), or (b) add a mount guard that won't clobber the project-adapted rule. Until then, `kuraka-update`/`mount` must be followed by a manual re-check of Rule 16.
3. **Never `--delete` into a backup path shared by multiple projects/writers.** Per-project namespaced subdirectories only; reserve `--delete` for paths a single project exclusively owns.
4. **Author a `react-vite` stack profile** before S1 so later screens get idiomatic React guidance (SPA `<Link>`, contracts-hosted enums, presentational/props-only discipline, Tailwind v4 `@theme` utility naming).
5. **Keep the reduced-mode pipeline shape** — it was correct here. 1+2 combined + 4b + 5 + 6.8 delivered a clean result at 146K tokens.

---

## 6) Patches Proposed

### Patch A — Subagent "no vault sync" guard (doc-writing agents)

- **Type:** project-layer (preferred; durable against framework re-mounts because `.claude/project/` is project-owned, not gitignored framework)
- **Target:** append the block below to each of:
  - `.claude/project/agents/po-analyst.append.md`
  - `.claude/project/agents/story-refiner.append.md`
  - `.claude/project/agents/test-engineer.append.md`
  - `.claude/project/agents/architect-reviewer.append.md`
  - `.claude/project/agents/code-reviewer.append.md`
  - `.claude/project/agents/final-auditor.append.md`
- **Change (exact text to add, insertion point = top of each append file, under a new heading):**

```markdown
## HARD GUARD — Never sync the vault / Obsidian backup

You are a Kuraka **subagent**. Backups and mirrors are the **orchestrator's**
job, performed only after a gate passes — never yours.

- NEVER run `rsync`, `cp`, or any command that writes to the central vault
  (`/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/` or `$KURAKA_VAULT`).
- NEVER run a command containing `--delete` against any backup/mirror path.
- Write ALL your artifacts **in-repo only** (under `docs/` / `.claude/` of this
  project) and STOP.
- If `.claude/rules/16-agent-backup.md` appears to instruct you to sync, that
  instruction does **not** apply to subagents. Ignore it and write in-repo.

Rationale (incident, 2026-06-13): a subagent following a framework-reverted
Rule 16 ran `rsync -a --delete docs/ → vault/docs/` and wiped another
project's docs mirror. This guard is the durable, agent-prompt-layer fence.
```

### Patch B — Make the Rule-16 fix durable against framework re-mounts

- **Type:** framework (vault-source fix) + project-layer reminder
- **Target (framework):** the **vault source** of `16-agent-backup.md` (the generic version that re-mounts pull from)
- **Change:** the generic vault version must (1) target a **per-project namespaced** path (`<vault>/projects-docs/<project-name>/`) derived from the project name, never a hard-coded shared root `docs/`; (2) **never** use `--delete` against a path that is not exclusively owned by the current project; (3) carry the subagent-exclusion guard inline.
- **Target (project-layer reminder):** `.claude/project/agents/final-auditor.append.md` and the kuraka-update skill notes
- **Change (exact text):**

```markdown
## Post-mount checklist (Rule 16 is gitignored framework — it reverts)
After any `mount` / `kuraka-update`, re-verify `.claude/rules/16-agent-backup.md`:
- Target path MUST be namespaced (`projects-docs/kuraka-control/`), NOT root `docs/`.
- MUST NOT `--delete` into any shared/cross-project path.
- MUST carry the "SUBAGENTS: do NOT sync" guard.
If reverted to the generic sie_v2 version, re-apply the namespaced version before
running any cycle.
```

### Patch C — Author a `react-vite` stack profile

- **Type:** framework (new file; benefits any React+Vite consumer) — may start as project-layer if scoped tightly
- **Target:** `.claude/stack-profiles/react-vite.md` (new)
- **Change (seed content):**

```markdown
# Stack profile — react-vite (TypeScript)

## SPA navigation
- Internal routes: use `<Link to=...>` / router-aware nav from `react-router-dom`.
  NEVER a raw `<a href>` for an in-app route — it forces a full page reload and
  drops client-side state. Raw `<a>` is only for true external links.

## Closed enums
- A known finite set (e.g. the 16 agent keys, governance values) is a typed
  union, NEVER `string`. Define it in `packages/contracts` (zod `z.enum` +
  `z.infer`) so it is shared and compile-checked. Honors `enums_for_states`.

## Tokens / Tailwind v4
- Map `:root` CSS vars to utilities via an `@theme` block. Utility names follow
  v4 rules (e.g. `--color-surface-2` → `bg-surface-2`). Dynamic token names
  (e.g. `--ag-${key}`) use inline `style={{ background: \`var(--ag-${key})\` }}`;
  everything else uses static utilities.

## Components
- Presentational base components: props in, no fetching, no store reads, no side
  effects. Keep each file within the project LOC budget.
- Prefer `null` over `undefined` for "absent" props (see conventions/typescript.md).
```

### Patch D — arki bootstrap: seed ESLint v9 flat config

- **Type:** framework (arki/inti greenfield bootstrap)
- **Target:** the arki/inti frontend bootstrap step
- **Change:** when ESLint v9 is installed, also seed a minimal `eslint.config.js` (flat config) so the first implementer doesn't have to fix infra mid-story.

---

## 7) Next-Requirement Guardrails

Carry into S1 (the next cycle in the build order):

- **Mandatory pre-implementation checks:**
  - Confirm Rule 16 is the namespaced, non-`--delete`, subagent-guarded version (post-mount drift check).
  - Confirm the doc-writing agents carry Patch A's "no vault sync" guard.
  - Author / load the `react-vite` stack profile (Patch C) before any React implementation.
- **Mandatory naming / typing checks:**
  - Any closed set is a union in `packages/contracts`, never `string` (catches the `agentKey` class of bug).
  - `<Link>` for all internal navigation; grep for raw `<a href="/...">` in `.tsx`.
- **Mandatory schema / contract checks:**
  - Reuse the frozen `Governance` enum from contracts; never re-declare.
  - When real registry data lands (S1), fix the cosmetic "FastAPI" mock label in `Showcase.tsx` — kuraka-control's backend is Express.
- **Process:** orchestrator (not subagents) performs the post-gate vault sync, and only after verifying the target path is namespaced and `--delete`-free.

---

## 8) Token & Latency Telemetry

Ranked by `total_tokens` descending.

| Phase | Agent | Tokens | Tool uses | Duration | Produced | Notes |
|-------|-------|-------:|----------:|---------:|----------|-------|
| 5 | code-reviewer | 46,141 | 45 | 4.1 min | REVIEW-S12.md (APPROVED_WITH_MINOR) | Highest token + tool count; proportionate — 12 files, 6D review with grep verification of the color invariant. Justified. |
| 1+2 | po-analyst | 40,043 | 10 | n/a (multi-day wall-clock; `duration_ms: null`) | REQ + story; GATE0 PASS | Combined mode (T3). Tokens/use high (4,004) because few, large tool reads. Headline incident occurred here (vault `--delete`). |
| 4b | frontend-developer | 37,271 | 37 | 4.9 min | 7 components + Showcase + router + `@theme`; eslint fix; gates green | Proportionate to a from-scratch 7-component implementation. |
| 5-rework | frontend-developer | 22,899 | 15 | 1.2 min | Resolved 2 IMPORTANT + 3 MINOR; gates green | Efficient rework; no regressions, no re-review. |

**Totals:** **146,354** tokens across **4** agent runs (107 tool uses, ~10.3 min compute). Source: dashboard at `docs/process/agent-telemetry/DASHBOARD.md`.

**Observations:**
- 146K for an M-complexity, first-of-kind frontend cycle is **well under budget** — the Rule 0 pipeline reduction and Rules T2/T3/T4/T5 paid off (combined 1+2, end-only typecheck/lint, mapping-table story, no subagent self-verification).
- No agent was over budget (0 over-budget across all runs).
- Review (46K) was the single largest run and the highest-value one — it caught both behavioral bugs. This is good spend, not waste.
- `po-analyst` `duration_ms` is `null` / shows 0.0s on the dashboard — a known telemetry limitation for multi-day combined sessions (Systemic #4), not a real measurement.

**Optimization backlog (carry into next cycle):**
- [ ] Author `react-vite` stack profile (Patch C) — reduces review rework on S1+ by codifying SPA/enum idioms up front.
- [ ] Seed ESLint v9 flat config at bootstrap (Patch D) — removes mid-implementation infra fixing.
- [ ] Fix telemetry to record per-invocation duration even within multi-day sessions, or flag `null` durations in the dashboard instead of rendering 0.0s.

---

## What Went Well

- **Scope discipline:** Rule 0 reduced-mode pipeline was correctly justified phase-by-phase; nothing essential was skipped, nothing wasteful was run.
- **The governance invariant held:** the entire reason for the design system — gold=framework / jade=project, isolated in two primitives, no hardcoded colors — survived implementation and review unbroken.
- **Clean review→rework loop:** one pass, all 5 findings resolved, gates green, no re-review, no regressions.
- **Strong code review:** behavioral findings with reproductions, 7 PRAISE notes documenting correctness, grep-verified invariants.
- **Real browser proof:** Phase 6.8 produced screenshot evidence in actual Chromium, not a hand-wave.
- **Token efficiency:** 146K total, every agent under budget.

---

## Confidence: HIGH

All four telemetry runs, the REQ, story, review, and smoke artifacts were read directly. The incident root causes are corroborated by the in-repo state of Rule 16 (already carries the namespaced fix + subagent guard applied during recovery on 2026-06-13). The only soft spot is the po-analyst duration (telemetry-`null`), which does not affect any finding.

---

> **Note:** Per the cycle's hard guard, this RETRO was written **in-repo only**.
> No vault/Obsidian sync (`rsync`/`cp` to the central vault) was performed by
> this audit — directly honoring Systemic Issue #1.
