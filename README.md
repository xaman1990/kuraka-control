# kuraka-control

**Kuraka Control Plane** — local single-user web dashboard to govern the Kuraka
framework across multiple consumer projects (observe + act).

This is Phase 1 of the control plane defined in the Kuraka vault's `CONTROL-PLANE.md`.
It is a **greenfield project built with Kuraka itself** (dogfood) — the first project in
the registry, validating the hub-and-spoke model.

## Status

Scaffolded by `arki` (2026-06-07). Foundation laid; no features yet. The skeleton
boots; real screens are built via `/kuraka` cycles (build order below).

## Stack

| Piece | Choice |
|-------|--------|
| Layout | npm-workspaces monorepo: `backend/`, `frontend/`, `packages/contracts/` |
| Language | TypeScript (strict), both sides |
| Backend | Node + Express 4 · gray-matter · yaml · chokidar · Vitest · tsx |
| Frontend | React · Vite · Zustand · react-router-dom · @tanstack/react-query · Tailwind v4 · Vitest |
| Contract | `packages/contracts` — zod schemas shared (backend validates, frontend types) |
| Store | None (no DB) — the vault + project filesystems are the source of truth (C2) |

Rationale + ADRs: `docs/arquitectura/`. Stack master ADR: `docs/arquitectura/stack-decision.md`.

## Getting started

```bash
cp .env.example .env        # set KURAKA_VAULT if your vault is elsewhere
npm install                 # one install, all workspaces
make dev                    # backend :5174 + frontend :5173 (Vite proxies /api → backend)
# open http://localhost:5173 — the shell shows backend health + vault reachability
make test                   # vitest both sides
```

## Build order (MVP of observe + act)

`S12 → S1 → S2 → S3 → S4 → S5 → S7`, then S6, S8 (watcher spike first), S9, S11, S10.
Refine each with `story-refiner`. See `docs/discovery/spec-v1.md` §6.

## Develop via Kuraka, not by hand

Features are implemented by the Kuraka orchestrator: `/kuraka <feature>`. See
`CLAUDE.md` for the orchestration rules and `.claude/project/` for this repo's
conventions and review-checks.
