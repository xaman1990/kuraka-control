# ADR-002 — npm-workspaces monorepo + shared contracts package

**Status:** proposed (fork #3 for user confirm) · **Date:** 2026-06-07

## Context
C1 mandates **one repo, two pieces**. The two pieces share one thing tightly:
the **HTTP API contract** (request/response shapes for registry, project detail,
triage, governance-action runs, the live-state channel). Discovery lists no
preference between a flat two-directory layout and workspaces.

## Decision
Root `package.json` with **npm workspaces**:

```
package.json            # workspaces: ["packages/*", "backend", "frontend"]
packages/contracts/     # @kuraka-control/contracts — zod schemas + inferred TS types
backend/                # @kuraka-control/backend — Express, imports contracts
frontend/               # @kuraka-control/frontend — React+Vite, imports contracts
```

`packages/contracts` exports **zod schemas** for every API payload; the backend
uses them to validate at the route boundary, the frontend uses the inferred
types for react-query hooks. One definition → both sides cannot drift.

## Rationale
- Single `npm install` at root; one lockfile; tool configs (tsconfig base,
  eslint) shared.
- The contracts package is the project's primary **designed-for-change** point:
  evolving an endpoint changes one schema and the compiler flags every consumer.
- Matches dbcanvas (also workspaces) → familiar to the operator.

## Alternatives considered
- **Flat `backend/` + `frontend/`, types duplicated** — simpler, but reintroduces
  drift the typed contract exists to kill. Rejected.
- **pnpm workspaces** — fine, but npm matches dbcanvas and needs no extra tool.

## Consequences
- Kuraka commands are workspace-scoped: `npm -w backend run test`, etc. (already
  reflected in `kuraka.config.yaml`).
- `tests_root: tests/` in config is the repo-level cross-cutting bucket; unit
  tests co-locate inside each workspace (`backend/tests`, `frontend/tests`).
