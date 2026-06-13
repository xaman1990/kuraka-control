# Layers — kuraka-control

## Backend (Express, layered)

Order (outer → inner), enforced by `architecture.layers` in `kuraka.config.yaml`:

| Layer | Dir | Responsibility | May call |
|-------|-----|----------------|----------|
| **route** | `backend/src/routes/` | HTTP shape, **zod** request validation (from `contracts`), status codes, SSE | service |
| **service** | `backend/src/services/` | use-cases: governance actions, triage state machine, drift calc, fleet/live aggregation | repository, domain |
| **repository** | `backend/src/repositories/` | I/O adapters: `VaultRepository`, `ProjectRepository`, `TelemetryRepository`, `BudgetRepository`, `ScriptRunner`, `WriteFirewall`, `Watcher` | fs / subprocess / domain |
| **domain** | `backend/src/domain/` | pure types + parsers: frontmatter/yaml/json parse, triage state union, finding-identity key, drift comparison. No I/O. | — |

Rules: a route never touches fs/subprocess directly; only `repository` does I/O;
`domain` is pure (unit-testable without fs). The **only** module that writes is
`WriteFirewall` (adr-006); the **only** module that spawns is `ScriptRunner`
(adr-005).

Cross-cutting (`backend/src/lib/`, `backend/src/config/`): path resolver + allowed-
roots, env (`KURAKA_VAULT`), error→HTTP mapping (no silent failure).

## Frontend (React + Vite)

| Concern | Dir | Choice |
|---------|-----|--------|
| Routing | `frontend/src/routes/` | react-router-dom v6; 5 screens + nested Project-Detail tabs |
| Server state | `frontend/src/api/` | @tanstack/react-query hooks over the typed `contracts`; one `EventSource` for `/api/live` |
| UI state | `frontend/src/stores/` | Zustand (active panel, selected card, output-panel open) — **not** server data |
| Components | `frontend/src/components/` | MetricCard, ProjectCard, AgentCard, NavItem, Badge, GovernanceBadge, OutputPanel, FileTree |
| Theme | `frontend/src/theme/` | Quipu tokens (CSS vars) + Tailwind v4 `@theme` (adr-007) |

Rule: server data lives in react-query, never duplicated into Zustand. Components
stay ≤ `max_frontend_file_loc` (300).

## The seam
`packages/contracts` defines zod schemas → backend validates, frontend infers
types. Changing the API changes one schema; the compiler flags every consumer.
