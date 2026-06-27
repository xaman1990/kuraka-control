# REQ-20260612-S12: Design-System Foundation (Quipu theme + governance two-color)

## Workflow Status (Reduced-by-risk — frontend-only, no logic/contract/DB/auth)
- [x] Phase 1: PO Analysis — IN PROGRESS (combined with Phase 2, rule T3)
- [x] Phase 2: Story Refinement — IN PROGRESS (combined with Phase 1, rule T3)
- [ ] Phase 2.5: Pattern Detect — SKIPPED (no recurring-issue surface; greenfield, presentational only)
- [ ] Phase 3: Architect Review — SKIPPED (no new contract/DB/auth seam; `Governance` enum already frozen in contracts)
- [ ] Phase 4b: Implementation (frontend) — PENDING
- [ ] Phase 5: Code Review — PENDING
- [ ] Phase 5.5: Security Review — SKIPPED (no auth, no fs writes, no subprocess, no user input)
- [ ] Phase 6: Unit Tests — SKIPPED (presentational components; coverage delegated to the 6.8 showcase smoke)
- [ ] Phase 6.5: E2E — SKIPPED (no flows; no backend integration)
- [ ] Phase 6.7: Deployment Verify — SKIPPED (no deploy surface change)
- [ ] Phase 6.8: Showcase Smoke — PENDING (visual proof: `/showcase` renders every component + both governance colors)
- [ ] Phase 7: Final Audit — PENDING

**Mode confirmation:** **Reduced-by-risk** (Kuraka token-optimization Rule 0).
Justification: the change surface is frontend-only — CSS tokens + Tailwind v4
`@theme` wiring + five presentational React components + two governance
primitives + one static `/showcase` route. It touches **no** business logic,
**no** API contract change (the `Governance` enum already exists and is reused
verbatim), **no** database (the project has none), **no** auth, **no** fs
writes, **no** subprocess. Components accept props only. The only added
verification value comes from code review (5), the showcase smoke (6.8), and
the final audit (7).

## Open Questions (GATE0)
None — consistency check **PASSED**. The `pencil-new.pen` is unavailable and
visual pixel-matching is **explicitly deferred** per spec-v1 §2 and the build
order; we build from the §2 text + seeded `tokens.css`. Not a blocker.

## 1. Requirement Summary
S12 is the design-system foundation for kuraka-control: the first story in the
build order (S12 → S1 → S2 → S3 → S4 → S5 → S7), reused by every later screen.
It refines the seeded Quipu theme (`tokens.css`), wires Tailwind v4 `@theme`
utilities, and delivers five presentational base components plus the
two-color **governance** primitives (`GovernanceBadge`, `GovernanceDot`) that
consume the typed `Governance` enum. A `/showcase` route renders everything
with mock props as the visual proof for the Phase 6.8 smoke test.

## 2. Scope

### In Scope
- Refine/extend `frontend/src/theme/tokens.css` (build on the 46-line arki seed; do not reinvent).
- Add a Tailwind v4 `@theme` block mapping `:root` vars → utilities (gap: seed has `@import "tailwindcss"` but no `@theme`).
- **Reuse** the existing `Governance` enum from `packages/contracts/src/index.ts` (zod `z.enum(["framework","project"])` + `z.infer`). No re-declaration.
- `GovernanceBadge` and `GovernanceDot` — consume `Governance`, map to `--gov-framework` (gold) / `--gov-project` (jade). No hard-coded colors.
- Five presentational base components with typed props consuming tokens: **MetricCard, ProjectCard, AgentCard, NavItem, Badge**.
- Per-agent dot color usage via the seeded `--ag-*` tokens (16 agents) in `AgentCard`.
- A `/showcase` route (`frontend/src/routes/`) rendering every component + the two-color governance convention with static/mock props. Requires bootstrapping a minimal `react-router-dom` v6 router (installed, not yet wired) whose only initial route is `/showcase`.

### Out of Scope
- Real data fetching / backend integration — components take props only.
- The real screens: Monitor, Project Detail, Triage, Agentes, Onboard (S1+).
- Routing for the real screens (only `/showcase` is added now).
- The write-firewall *behavior* (backend, ADR-006).
- The live-state watcher / "Quipu en vivo" (S8).
- Visual pixel-matching to `pencil-new.pen` (explicitly deferred).
- `OutputPanel`, `FileTree` (listed in components README for later screens).
- Unit-test suites for each component (delegated to the 6.8 showcase smoke).

## 3. Table Inventory
Not applicable — kuraka-control has **no database** (`conventions.multi_tenant:
false`; no `database:` section; the vault filesystem is the store). No tables
created, altered, or referenced.

## 4. Affected Endpoints
None. This story adds no HTTP surface. The `/showcase` route is a client-side
React Router route, not an API endpoint.

## 5. Affected Files

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/theme/tokens.css` | ALTER | Add Tailwind v4 `@theme` block mapping `:root` vars → utilities; refine/extend seeded tokens only. |
| `packages/contracts/src/index.ts` | NONE (reuse) | `Governance` enum already exists; consumed, not modified. |
| `frontend/src/components/GovernanceBadge.tsx` | CREATE | Badge consuming `Governance` → `--gov-framework`/`--gov-project`. |
| `frontend/src/components/GovernanceDot.tsx` | CREATE | Dot consuming `Governance` → governance tokens. |
| `frontend/src/components/Badge.tsx` | CREATE | Generic token-driven badge (variant via tokens). |
| `frontend/src/components/MetricCard.tsx` | CREATE | Presentational metric card (label/value/optional governance). |
| `frontend/src/components/ProjectCard.tsx` | CREATE | Presentational project summary card; governance = jade/gold per item. |
| `frontend/src/components/AgentCard.tsx` | CREATE | Presentational agent card; dot color via `--ag-*`. |
| `frontend/src/components/NavItem.tsx` | CREATE | Presentational nav item (active/idle states via tokens). |
| `frontend/src/routes/Showcase.tsx` | CREATE | `/showcase` route rendering all components + both governance colors with mock props. |
| `frontend/src/App.tsx` | ALTER | Bootstrap a minimal `react-router-dom` v6 router hosting `/showcase` (replaces the health-probe skeleton body, or mounts alongside). |

(Paths follow `architecture.paths.frontend_root` and the components/routes
layout seeded by arki. No layout invented.)

## 6. Dependencies
- `tailwindcss@^4` + `@tailwindcss/vite` — already installed and wired in `vite.config.ts`. **Settled** (ADR-007 fork #1 resolved; do not re-open).
- `react-router-dom@^6` — already installed; router not yet bootstrapped (this story bootstraps the first route).
- `@kuraka-control/contracts` — workspace dependency present in `frontend/package.json`; supplies the `Governance` enum.
- Seeded `tokens.css` (obsidian base, text ramp, `--accent`/`--gov-framework`, `--jade`/`--gov-project`, `--cord`, 16 `--ag-*`).

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| No React stack profile exists (only `python-fastapi.md`, `vue-pinia.md` under `.claude/stack-profiles/`). Framework-idiomatic React layout is not codified. | Medium | Flagged here. Use framework-neutral React + the arki-seeded `components/` and `routes/` layout as the de-facto layout. Recommend authoring `react-vite.md` profile after S12 lands so later screens have a reference. |
| Tailwind v4 `@theme` mapping is new in this repo (seed has `@import` only). Wrong mapping = utilities silently absent. | Medium | Author validates utilities resolve by rendering `/showcase`; Phase 6.8 smoke confirms colors render (gold vs jade) visibly. |
| Hard-coding a governance color in a component (regression of the ADR-007 invariant). | High | Mapping-table AC forbids literal colors; every governance color must flow through `--gov-*` tokens. Code review (Phase 5) checks for hex/rgb literals in `.tsx`. |
| `Governance` enum re-declared instead of imported from contracts (drift from the single source of truth). | Medium | AC mandates `import { Governance } from "@kuraka-control/contracts"`; convention `typescript.md` forbids hand-redeclaring contract types. |
| `/showcase` router bootstrap accidentally removes the existing health-probe behavior other stories may rely on. | Low | App.tsx change is additive: keep health probe reachable or note its relocation; no story currently depends on the root path. |
| File exceeds `max_frontend_file_loc: 300`. | Low | Components are small and single-purpose; showcase split if it grows. |

## 8. Proposed Stories
Single story (Phase 1+2 combined, Rule T3). No decomposition needed — the
design system is one cohesive deliverable consumed atomically by later screens.

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S12 | Design-system foundation: Quipu tokens + Tailwind v4 `@theme` + 5 base components + governance primitives + `/showcase` | M | None (head of build order) |

Story file: `docs/process/stories/S12-design-system.md`
