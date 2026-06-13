# Stack Decision (master ADR) — kuraka-control

**Status:** accepted (locked parts) + proposed (open parts arki chose)
**Date:** 2026-06-07 · **Author:** arki · **Inputs:** vision.md, requirements.md (C1–C6), brief.md, spec-v1.md

## Locked by discovery (C1) — not arki's to choose

| Piece | Choice | Source |
|-------|--------|--------|
| Topology | Two pieces, **one repo** | C1 |
| Backend | **Node + Express** — only piece with fs access + subprocess execution | C1 |
| Frontend | **React + Vite + Zustand** SPA consuming the backend API | C1 |
| Source of truth | Vault filesystem at `KURAKA_VAULT` (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`) | C2 |

> No stack profile exists for this combination (the vault's
> `kuraka-artifacts/stack-profiles/` is empty). Idiomatic paths were inferred
> from the **dbcanvas** precedent (same React+Vite+Zustand+Express stack) and
> Express MVC conventions. **TODO:** once this stack stabilizes, contribute a
> `node-express-react-vite` profile back to the framework.

## Open decisions arki owns (filled here)

| Decision | Choice | One-line rationale | ADR |
|----------|--------|--------------------|-----|
| Language | **TypeScript** both sides | dbcanvas precedent (TS 88%); type-safe API contract; matches `stack.frontend.language` | adr-001 |
| Layout | **npm workspaces** (`backend/`, `frontend/`, `packages/contracts/`) | one repo (C1) + shared request/response types in one install | adr-002 |
| HTTP | **Express 4** | locked by C1; v4 is the stable LTS line | — |
| Validation | **zod** | runtime + static types from one schema; drives the shared contracts package | adr-002 |
| Frontmatter | **gray-matter** | de-facto md frontmatter parser; reads registry/agents/triage fm | adr-003 |
| YAML | **yaml** (eemeli) | parses each project's `kuraka.config.yaml` | adr-003 |
| Watcher | **chokidar** (spike) | mature fs-watch; transport for "Quipu en vivo" — see spike | adr-004 |
| Routing | **react-router-dom v6** | 5 screens + nested project-detail tabs | layers.md |
| Data fetching | **@tanstack/react-query** | server-state cache/refetch over the read-heavy API; SSE/poll-friendly | adr-004, layers.md |
| Styling | **Tailwind CSS v4** + Quipu CSS-var tokens | spec §2 design system; tokens as `:root` vars, Tailwind utilities | adr-007 |
| State (client) | **Zustand** | locked by C1; UI-only state (active screen, panels) | — |
| Backend tests | **Vitest** | fast, ESM-native, same runner both sides | — |
| Frontend tests | **Vitest + @testing-library/react** | matches dbcanvas; component + store tests | — |
| Dev runner | **tsx** (backend), Vite dev (frontend) | no build step in dev; instant reload | deployment.md |
| Dev topology | **Vite proxy `/api` → Express :5174** | one origin in the browser, no CORS, prod-like | deployment.md |

## Why these, against the requirements

- **No database** — the data contracts (registry, agents, triage, telemetry,
  project layer) are all **files on disk** read live (C2). Adding a DB would
  duplicate the source of truth and violate "vault is the source of truth".
  Persistent app state (triage cards) is itself a vault artifact
  (`retro-triage/*.md`).
- **Shared `contracts` package** — the API is the seam between the two locked
  pieces; a zod-defined contract gives the frontend exact types and the backend
  exact validation from one definition. This is the single most leveraged
  "designed for change" point (adr-002).
- **react-query over the read-heavy surface** — Screens 1–4 are observation;
  caching + background refetch + a single live channel for the watcher (adr-004)
  fit the read model better than hand-rolled fetch-in-Zustand.

## What we sacrificed (honest tradeoffs)

- **No profile coverage** → first cycles pay an inference cost; mitigated by the
  dbcanvas precedent and by contributing a profile afterwards.
- **No DB** → cross-project queries (telemetry aggregation, dedup) are O(files)
  scans each request; acceptable for a single-user fleet of ~3 projects, may
  need an in-memory index cache later (noted in domain-model.md).
- **Tailwind v4** is newer than v3; if the team prefers v3 stability this is a
  one-line fork (see adr-007). Flagged for user confirm.

## Forks flagged to the user (confirm before first /kuraka)

1. **Tailwind v4 vs v3** — chose v4; trivial to downgrade. (adr-007)
2. **Watcher transport** — recommended chokidar + SSE, gated behind a spike
   (S8). The *event source* (how an agent announces "phase Y now") is genuinely
   unresolved — see adr-004. **This is the one fork that needs a decision.**
3. **Shared contracts package** vs duplicating types — recommend the package;
   confirm you want the extra workspace. (adr-002)
