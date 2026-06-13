# Deployment — kuraka-control

Target: **localhost, single process pair**, single operator (NFR). No
containers, no remote, no cloud (out of scope v1). Docker is intentionally
**not** used — the backend needs direct host fs access to the vault and to
arbitrary project paths, and must spawn host Python/sh scripts (C5); a container
would have to mount everything and lose the simplicity.

## Run topology (dev = prod for v1)

```
  browser ──► Vite dev server (:5173)
                 │  proxy  /api/*  ─────► Express backend (:5174)
                 │                          ├─ reads vault (KURAKA_VAULT)
                 │                          ├─ reads each project path (live)
                 │                          ├─ spawns vault scripts (subprocess)
                 │                          └─ /api/live  SSE  (watcher, S8)
                 └─ serves React SPA + HMR
```

- **Vite proxy** (`vite.config.ts` `server.proxy`) routes `/api` → `:5174`, so
  the browser sees one origin → no CORS, prod-like paths.
- Backend dev runner: **tsx** (`backend/src/index.ts`), no build step in dev.
- Frontend dev: `vite`.

## Commands (root, npm workspaces)

| Command | Effect |
|---------|--------|
| `make dev` | runs backend (tsx watch) + frontend (vite) concurrently |
| `make build` | `tsc` typecheck + `vite build` (frontend), `tsc` build (backend) |
| `make test` | `vitest` in both workspaces |
| `make lint` | eslint both workspaces |
| `npm install` | one install for all workspaces |

## Environment
`.env` (gitignored), seeded from `.env.example`:
- `KURAKA_VAULT` — default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`
- `BACKEND_PORT` — default `5174`
- `FRONTEND_PORT` — default `5173`

## Production note (v1)
"Production" = the operator runs `make dev` (or a `make start` that serves the
built SPA from Express). A single-binary build is out of scope; revisit only if
the tool leaves the single-operator localhost model.
