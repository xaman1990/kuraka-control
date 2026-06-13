# S12 — Design-System Foundation (Quipu theme + governance two-color)

**REQ:** `docs/process/REQ-20260612-S12-design-system.md`
**Mode:** Reduced-by-risk (frontend-only). **Build order:** head (S12 → S1 → …).
**Source of truth:** spec-v1 §2 text + arki-seeded `tokens.css`. The `.pen` is
deferred — do NOT block on it; visual pixel-matching is out of scope.

## Invariants (narrative AC — behavior/ordering matters)
- **AC-G1** `GovernanceBadge governance="framework"` renders the **gold** token (`--gov-framework`); `governance="project"` renders the **jade** token (`--gov-project`). Same rule for `GovernanceDot`.
- **AC-G2** **No component hard-codes a color.** Every color flows through a CSS var / Tailwind-v4 utility backed by a `:root` token. No hex/rgb/named-color literal appears in any `.tsx`.
- **AC-G3** The `Governance` type is **imported** from `@kuraka-control/contracts` (`z.enum(["framework","project"])` + `z.infer`). It is NOT re-declared in the frontend. `enums_for_states` holds: governance is the typed union, never a loose string.
- **AC-T1** `tokens.css` keeps the seeded `:root` tokens and **adds** a Tailwind v4 `@theme` block so the tokens are reachable as utilities. Refine/extend only — no token is removed or renamed.
- **AC-S1** `/showcase` renders **every** component below at least once, including `GovernanceBadge`/`GovernanceDot` shown in **both** governance colors side by side (the visual proof for the Phase 6.8 smoke).
- **AC-S2** All components are **presentational**: props in, no data fetching, no store reads, no side effects. Each file ≤ 300 LOC.

## Component / prop contract (mapping table)

| Component | Props (typed, `T \| null` for absent) | Tokens consumed | Showcase coverage |
|-----------|----------------------------------------|-----------------|-------------------|
| `GovernanceBadge` | `{ governance: Governance; label?: string \| null }` | `--gov-framework`, `--gov-project`, `--text` | Both values rendered: "framework" (gold) + "project" (jade), side by side |
| `GovernanceDot` | `{ governance: Governance; size?: "sm" \| "md" }` | `--gov-framework`, `--gov-project` | Both values rendered next to their labels |
| `Badge` | `{ children: ReactNode; variant?: "neutral" \| "accent" \| "jade" \| "muted" }` | `--surface-2`, `--border`, `--accent`, `--jade`, `--text-2` | One badge per variant |
| `MetricCard` | `{ label: string; value: string \| number; governance?: Governance \| null; hint?: string \| null }` | `--surface`, `--border`, `--text`, `--text-2`, `--text-3`, `--gov-*` | ≥2 cards: one framework, one project, one with `hint` |
| `ProjectCard` | `{ name: string; stack: string; status: "active" \| "paused" \| "onboarding" \| "archived"; governance: Governance; kurakaVersion?: string \| null }` | `--surface`, `--border`, `--text`, `--text-2`, `--gov-*`, status via `Badge` | ≥2 cards covering ≥2 statuses + both governances |
| `AgentCard` | `{ name: string; agentKey: string; governance: Governance }` (agentKey ∈ the 16 `--ag-*` keys) | `--ag-{agentKey}` for the dot, `--surface`, `--border`, `--text`, `--gov-*` | ≥3 agents using distinct `--ag-*` colors (e.g. po-analyst, backend-developer, security-reviewer) |
| `NavItem` | `{ label: string; icon?: ReactNode; active?: boolean; href?: string \| null }` | `--text-2` (idle), `--text` + `--accent` (active), `--surface-2` (hover) | One active + one idle item |

**Notes for the implementer**
- `agentKey` maps to the seeded `--ag-*` tokens; resolve the dot color via the token (e.g. `style={{ background: \`var(--ag-${agentKey})\` }}`), never via a literal. The 16 keys + their colors are in `tokens.css` and ADR-007.
- Prefer Tailwind v4 utilities (from `@theme`) for layout/spacing; use `var(--token)` inline only where a dynamic token name is required (the `--ag-*` dot).
- `null` over `undefined` for "absent" per `conventions/typescript.md`.

## Token additions (beyond the arki seed)

| Token / construct | Add? | Reason |
|-------------------|------|--------|
| `@theme { … }` block | **ADD** | v4 utility wiring; seed has `@import "tailwindcss"` only. Map existing `:root` vars to utilities (`--color-bg`, `--color-surface`, `--color-accent`, etc.). |
| New color tokens | **NO** | All needed colors (obsidian, text ramp, gold, jade, cord, 16 `--ag-*`) are already seeded. Do not add. |
| Radius / spacing / shadow tokens | **OPTIONAL** | Add only if a component visibly needs one and it is not already a Tailwind default. If added, document inline in `tokens.css`. |

## Routing change (App.tsx)
- Bootstrap a minimal `react-router-dom` v6 router. Initial routes: `/showcase`
  (the only screen this story owns). Keep the existing health probe reachable
  (e.g. at `/` or fold it into a tiny landing) — additive, do not delete it.

## Definition of Done
- `npm -w frontend run typecheck` and `npm -w frontend run lint` pass (run **once at the end** — pure presentational edits, Rule T2).
- `/showcase` renders all 7 components; `GovernanceBadge`/`GovernanceDot` show gold and jade side by side (Phase 6.8 smoke).
- Grep proof: **no** hex/rgb/named-color literal in any new `.tsx` (AC-G2).
- `Governance` imported from contracts, not re-declared (AC-G3).
- Every file ≤ 300 LOC (`max_frontend_file_loc`).

> Implementer: do NOT run verification scripts beyond the end-of-pass
> typecheck+lint; report (1) files modified, (2) ACs satisfied, (3) any AC you
> could not satisfy and why. The orchestrator verifies externally (Rule T5).
