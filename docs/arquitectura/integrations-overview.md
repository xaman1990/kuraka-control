# Integrations overview — kuraka-control

No third-party APIs, no cloud, no DB. All integrations are **local filesystem**
or **local subprocess**. Direction is from the backend's perspective.

| # | Integration | Direction | Protocol | Notes |
|---|-------------|-----------|----------|-------|
| I1 | **Vault filesystem** (`KURAKA_VAULT`) | read | fs + gray-matter/yaml | registry, agents, triage, budgets. Source of truth (C2). |
| I2 | Vault — `retro-triage/*.md` | **write** | fs (WriteFirewall) | only triage records (adr-006). |
| I3 | Vault — `agents/*.md` | **write** | fs (WriteFirewall) | framework patches, **confirm token required** (C6/RL-4). |
| I4 | **Project filesystem** (per registry `path`) | read | fs + yaml/json | config, project layer, RECURRING-ISSUES, telemetry. Read-only (C4). |
| I5 | Project — `.claude/project/**` | **write** | fs (WriteFirewall) | project patches only; never `backend/`/`frontend/` (C4). |
| I6 | `kuraka-init.py` | subprocess | spawn → stdout/exit | onboard wizard (idempotent). |
| I7 | `mount-kuraka.sh` | subprocess | spawn → exit + `requires_restart` | mount / sync action. |
| I8 | `validate-kuraka.sh` | subprocess | spawn → exit + per-agent errors | validate frontmatter. |
| I9 | `kuraka-inspect.py` | subprocess | spawn → **JSON** stdout | stack detection. |
| I10 | `aggregate-telemetry.py` | subprocess | spawn → writes DASHBOARD.md | per-project today; no `--registry` mode yet (adr-005). |
| I11 | **Watcher → SPA** | server→client | chokidar (fs) → SSE `/api/live` | live agent state, spike S8 (adr-004). |
| I12 | SPA → backend API | client→server | HTTP/JSON over Vite proxy | typed by `packages/contracts`. |

## Explicitly NOT integrated
- `scripts/sync-obsidian.sh` — DEPRECATED, **never wrapped** (C3). The "sync"
  action is `mount-kuraka.sh` (I7), vault→project.
- Any consumer `backend/`/`frontend/` write (C4).
- Any network/cloud service.
