# SMOKE-S12 — Design-System Foundation (Phase 6.8 runtime smoke)

**Cycle:** REQ-20260612-S12-design-system · **Mode:** Reduced-by-risk · **Date:** 2026-06-13
**Result:** ✅ PASS

## Principal end-to-end flow

> "The result of this cycle is that the system can now **render the Quipu design
> system in a real browser** — every base component, with the two-color
> governance convention (gold = framework, jade = project) visible everywhere."

This is the UI golden path: dev server up → navigate to `/showcase` → every
component renders with correct tokens.

## Scenario executed

| Step | Detail |
|------|--------|
| Command | `npm -w frontend run dev` (Vite 5.4.21, ready in 220 ms, `http://localhost:5173/`) |
| Driver | Playwright (real Chromium), `browser_navigate` → `http://localhost:5173/showcase` |
| Evidence | Full-page screenshot: `assets/SMOKE-S12-showcase.png` |
| Console | 1 error = `favicon.ico` 404 (cosmetic, unrelated to the design system); no JS/render errors |

## Components exercised (closed list — all 7 + tokens)

- **GovernanceBadge** — `framework` (gold) + `project` (jade) side by side, plus labelled variants. ✓ (AC-S1, AC-G1)
- **GovernanceDot** — framework/project in `sm` + `md`. ✓
- **Badge** — `neutral` / `accent` / `jade` / `muted`. ✓
- **MetricCard** — ×4: governance dot (framework + project), `hint` variant, plain. ✓
- **ProjectCard** — ×4: all four statuses (`active`/`paused`/`onboarding`/`archived`) and both governances. ✓
- **AgentCard** — ×6: distinct `--ag-*` dot colors (po-analyst=purple, backend-developer=green, security-reviewer=magenta, frontend-developer=blue, final-auditor=orange, amauta=gold). ✓
- **NavItem** — active (gold left border, `--text`) + idle items. ✓
- **Tokens / Tailwind v4 `@theme`** — obsidian base, gold/jade governance, agent colors all resolve as utilities (build CSS 4.7→10.4 kB). ✓ (AC-T1)
- **Two-color governance convention** — gold=framework / jade=project rendered consistently across Badge, MetricCard, ProjectCard, AgentCard. ✓ (ADR-007)

## Components NOT exercised (with justification)

- **Real screens (Monitor, Project Detail, Triage, Agentes, Onboard)** — out of
  scope for S12; built in S1+. Not part of this cycle's flow.
- **Backend / data fetching** — none in S12 (components are presentational,
  props-only). The `/` health probe was preserved but is a separate skeleton,
  not part of the design-system flow.
- **`NavItem` client-side navigation to a real route** — `<Link>` is wired
  (Phase 5 fix #1) but the destination routes don't exist until S1; the showcase
  proves render, not navigation.

## Nits for the retro (non-blocking)

- Showcase mock data labels `kuraka-control` as "React 18 + FastAPI + Tailwind v4"
  — placeholder text in `Showcase.tsx`; this project's backend is Express, not
  FastAPI. Cosmetic mock only; correct when real registry data lands (S1).
