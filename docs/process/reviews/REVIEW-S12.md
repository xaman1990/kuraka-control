# Code Review — S12 Design-System Foundation

**Reviewer:** code-reviewer (Phase 5, 6D framework)
**Date:** 2026-06-13
**Cycle:** S12 — Quipu theme + governance two-color
**Mode:** Reduced-by-risk (frontend-only, presentational)
**Files reviewed:** 12 (641 insertions)

---

**Verdict:** APPROVED_WITH_MINOR

---

## Summary

The S12 implementation is structurally sound and faithful to the story contract. All 7 components are presentational, correctly delegate governance color decisions to `GovernanceBadge`/`GovernanceDot`, import `Governance` from `@kuraka-control/contracts` without redeclaring it, and use CSS variable tokens with no hardcoded color literals. The AC table (AC-G1, G2, G3, T1, S1, S2) is fully satisfied. No BLOCKERs were found. Two IMPORTANT items must be addressed before S1 ships (they are benign for a showcase-only route but will cause real regressions the moment real navigation is wired).

---

## Findings

| # | Severity | File:Line | Description | Fix |
|---|----------|-----------|-------------|-----|
| 1 | IMPORTANT | `frontend/src/components/NavItem.tsx:37-46` | **Plain `<a href>` inside a `BrowserRouter` app causes full page reloads.** `NavItem` renders an `<a>` element for the `href` branch, bypassing react-router's client-side navigation. This is invisible in the showcase (routes don't exist yet) but will break real navigation in every subsequent story that wires nav links. | Replace the `<a>` with `import { Link } from "react-router-dom"` and render `<Link to={href} ...>`. The `aria-current` and class props transfer directly. |
| 2 | IMPORTANT | `frontend/src/components/AgentCard.tsx:6` | **`agentKey: string` is unconstrained — a typo silently renders an invisible dot.** The story's own note says `agentKey ∈ the 16 --ag-* keys`, but the prop type is plain `string`. A misspelled key (e.g. `"backend-dev"`) produces `var(--ag-backend-dev)` which resolves to empty string, making the dot background-less with no TypeScript or runtime error. | Define `type AgentKey = "amauta" \| "arki" \| "inti" \| ...` (all 16) in `packages/contracts/src/index.ts` and update the prop to `agentKey: AgentKey`. This gives compile-time safety and documents the closed set alongside the `--ag-*` token definition. |
| 3 | MINOR | `frontend/eslint.config.js:20` | **`"@typescript-eslint/ban-ts-comment": "off"` is unjustified.** The comment states it is "used in NavItem pattern", but `grep -rn "@ts-"` across `frontend/src/` returns zero results. The disable silences a rule that guards against suppressing type errors without explanation, with no actual usage to justify it. | Remove the rule override entirely. If a future `@ts-expect-error` is genuinely needed, re-add it with a tighter scope (specific file, not project-wide) at that time. |
| 4 | MINOR | `frontend/src/components/NavItem.tsx:5,31` | **`icon?: ReactNode` uses `undefined`-as-absent, deviating from the project's null convention.** `typescript.md` states "prefer `null` over `undefined` for absent; reserve `undefined` for not provided". The story contract itself uses `?:` (which implies `undefined`), so this is a contract-faithful deviation, but it diverges from the project's type discipline and the guard `icon !== undefined` is inconsistent with how all other nullable props in this cycle are handled (`href?: string \| null`, `governance?: Governance \| null`). | Update the prop to `icon?: ReactNode \| null` (default `null`) and change the guard to `icon !== null`. Also update the story's mapping table to reflect `ReactNode \| null` for consistency. |
| 5 | MINOR | `frontend/src/components/NavItem.tsx:31` | **`React.CSSProperties` used without an explicit `React` import.** Only `{ ReactNode }` is imported from `"react"`. With `"jsx": "react-jsx"` the JSX transform injects React automatically for JSX syntax, but `React.CSSProperties` accesses the `React` namespace as a type. TypeScript resolves it via the `@types/react` global augmentation in this configuration, so `typecheck` passes — but the dependency is implicit and will break if the tsconfig or @types/react version changes. | Either add `import React from "react"` alongside the existing import, or use `CSSProperties` from `"react"` directly: `import { ReactNode, CSSProperties } from "react"` and type the variable as `CSSProperties`. |

---

## Positive Notes

- **Governance invariant preserved cleanly.** The gold/jade branch lives exclusively in `GovernanceBadge` and `GovernanceDot`. `MetricCard`, `ProjectCard`, and `AgentCard` all delegate to these primitives — zero re-implementation of the two-color logic anywhere else.
- **Tailwind v4 `@theme` wiring is correct.** `--color-surface-2` in the `@theme` block maps to the `bg-surface-2` / `hover:bg-surface-2` utility class used in `NavItem` — a subtle v4 naming rule applied accurately.
- **`--ag-*` dot pattern is correct.** The dynamic token interpolation (`var(--ag-${agentKey})`) follows the story's explicit guidance for the one case where a runtime-determined token name is required. The rest of the components use static Tailwind utilities, matching the story's "prefer utilities" note.
- **AC-S1 showcase coverage is thorough.** Every component is rendered, `GovernanceBadge`/`GovernanceDot` appear with both governance values side by side, 6 `AgentCard` instances cover distinct `--ag-*` colors, 4 `ProjectCard` instances cover all 4 statuses, and 4 `MetricCard` instances cover both governance values + hint. This exceeds the minimum requirements.
- **Semantic HTML and accessibility are solid.** `<header>`, `<section>`, `<nav>` landmarks in Showcase; `aria-current="page"` on active `NavItem`; `role="img" aria-label` on standalone dots; inner dot in `GovernanceBadge` is `aria-hidden` (text label carries the meaning). The color-is-not-the-only-signal rule is satisfied: every governance indicator has an accompanying text label or visible key text.
- **`eslint.config.js` no-unused-vars pattern is correct.** Disabling the base JS `no-unused-vars` while preserving `@typescript-eslint/no-unused-vars` (from `recommended`) is the standard TS ESLint setup and is correctly documented. The `no-console: "warn"` posture is appropriate for an early-stage project.
- **File sizes all within budget.** Largest file is `Showcase.tsx` at 204 LOC (budget: 300). No function exceeds 50 LOC.

---

## Next Steps

1. **Fix finding #1 (IMPORTANT) before S1 wires real nav links.** `NavItem` must use `<Link>` from react-router-dom in the `href` branch. This is the only change that blocks real navigation from working.
2. **Fix finding #2 (IMPORTANT) in the same pass or as a quick contracts addition.** Define `AgentKey` as a 16-member union in `packages/contracts` and tighten the `agentKey` prop. This is the right time to do it while the token list and component are both fresh.
3. **Fix findings #3–#5 (MINOR) at implementer's discretion.** They are quality improvements and can be batched into the next cycle if the orchestrator judges the re-route cost too high for a showcase-only component.

---

## Confidence

HIGH — all 12 changed files reviewed against story contract, conventions, and project review checks. The two IMPORTANT findings are behavioral (not speculative): finding #1 is reproducible by clicking a nav link, finding #2 is reproducible by passing any string not in the 16-key set.
