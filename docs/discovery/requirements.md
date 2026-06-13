# Requirements — kuraka-control

> Synthesized from `brief.md` + `spec-v1.md` (reviewed with a po-analyst lens)
> and `CONTROL-PLANE.md`. Feeds `arki`. Architecture constraints (§ Constraints)
> are **non-negotiable** — carry through verbatim in intent.

## Functional

Organized by the 5 screens and the observe + act capabilities. Empty/error
states are first-class: **no silent failure** anywhere.

### Screen 1 — Resumen / Monitor (observe)

- FR-1.1 Show pulse KPIs across the fleet: registry counts, agent catalog count
  vs running-now count (disambiguated — e.g. 16 catalog vs 4 running).
- FR-1.2 "Quipu en vivo" hero showing live agent state ("agent X in phase Y
  now"), fed by a **new real-time watcher mechanism** (file-watch/IPC), with a
  legend. The watcher is new scope and needs a tech spike (see S8).
- FR-1.3 Surface telemetry summary cross-project; may render empty initially.
- FR-1.4 Primary action: onboard a new project.

### Screen 2 — Project Detail (observe + act)

- FR-2.1 Header with project identity and a **drift indicator**: live mounted
  Kuraka version (read from the project fs) vs the vault's current version.
- FR-2.2 Tab — Config / Overview: render `kuraka.config.yaml` (stack,
  architecture.paths, conventions, workflow).
- FR-2.3 Tab — Project Layer browser: file tree + content preview of
  `.claude/project/{conventions,review-checks,agents,lessons-learned}/` and
  `glossary.md`, read **live** from the project path.
- FR-2.4 Two-color governance applied in tree/badges: gold = framework, jade =
  project-native.
- FR-2.5 Tabs for RETRO & Triage, Telemetría, Ciclos, Agentes (per project).
- FR-2.6 Actions: Re-mount, Validate, Sync (sync = mount-based, vault→project;
  never the deprecated `sync-obsidian.sh`).

### Screen 3 — RETRO Triage board (act)

- FR-3.1 Read `RECURRING-ISSUES.md` patterns + existing `retro-triage/*.md`.
- FR-3.2 Kanban board reflecting the corrected improvement-loop state machine
  (see § RETRO improvement loop).
- FR-3.3 Per-finding routing: framework (marco) vs project (proyecto), with the
  routing rule of thumb (framework if it would recur in any stack; project if
  it depends on this project's conventions/oracle/schema; when in doubt prefer
  project layer — reversible, scoped).
- FR-3.4 Apply: write the patch to the correct target (framework agent or
  project layer). One-click for routing + project apply; **framework apply +
  mount-to-ALL requires explicit human confirm** (blast radius).
- FR-3.5 Defer, reject (reopenable), and the verification/regression flow.
- FR-3.6 Create triage record from `retro-triage/_TEMPLATE.md`.

### Screen 4 — Agentes catalog (observe + guarded act)

- FR-4.1 Catalog of all framework agents from `agents/*.md` (real colors +
  models) with per-project override listing.
- FR-4.2 Governance banner: framework agents are **editable only here**.
- FR-4.3 Agent detail: description, model, budget, activity, overrides.
- FR-4.4 Edit a framework agent (write to vault `agents/*.md`) — only from this
  app.

### Screen 5 — Onboard wizard (act)

- FR-5.1 Modal wizard: Ruta → Inspect → Config → Mount → Registrar.
- FR-5.2 Wraps `kuraka-init.py` (runs `kuraka-inspect` → drafts config with
  TODOs → creates `.claude/project/` skeleton → runs `mount-kuraka.sh` →
  upserts `projects/<name>.md`). Idempotent: never overwrites existing config or
  a populated project layer.
- FR-5.3 Surface the one remaining manual step: restart Claude Code in the
  target, then run `amauta` to fill the TODOs.

### Cross-cutting (act runner)

- FR-X.1 Governance action runner shells out to scripts and surfaces stdout +
  exit code in an output panel (mount / validate / inspect / aggregate).

## Non-functional

| Concern | Target | Rationale |
|---|---|---|
| Deployment | localhost, single process pair (Node backend + Vite front) | Single local user, no remote |
| Auth | none | v1 localhost, single operator (Carlos) |
| Multi-tenancy | no | Single user by design |
| Data residency | local fs only (vault + project paths) | No cloud, no PII transit |
| Live state latency | near-real-time agent-state updates | "Quipu en vivo" is the hero; watcher must feel live |
| Reliability | no silent failure; every script call shows exit code + output | po-analyst invariant |
| Vault integrity | mutations go through existing scripts when one exists; direct writes only to `retro-triage/*.md` + patch targets | Vault is source of truth |
| Idempotency | onboard/mount never overwrite existing config or populated project layer | `kuraka-init.py` contract |

## Constraints (NON-NEGOTIABLE — carry through verbatim in intent)

- **C1 — Two-piece topology, one repo.** Backend = **Node + Express**, the only
  piece with fs access and the ability to execute scripts as subprocesses; it
  reads the vault (markdown frontmatter + JSON), reads each registered project
  **live** by walking its `path`, runs vault scripts, writes triage records and
  applies patches. Frontend = **React + Vite + Zustand** SPA consuming the
  backend API. (Stack chosen for familiarity with dbcanvas.)
- **C2 — Vault is the source of truth.** Path configurable via `KURAKA_VAULT`
  (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`). Mutations
  pass through existing scripts when one exists; direct writes are limited to
  `retro-triage/*.md` and the destination files of a patch.
- **C3 — Never wrap `scripts/sync-obsidian.sh`** (DEPRECATED, one-way migration
  with `kuraka.lock`). The "sync" action is mount-based (vault→project);
  project→vault backup is out of scope for v1.
- **C4 — Consumer projects are read-only** except the explicit governance
  actions. The app never edits a consumer's `backend/` or `frontend/`.
- **C5 — Vault scripts have no external deps** (POSIX sh / Python 3 stdlib).
  The backend invokes them as subprocesses and parses stdout / exit code.
- **C6 — Visible governance, two colors.** Vault `agents/*.md` are writable
  **only** from this app; per-project layers are editable per project. The UI
  reflects this with badges: **gold = framework** (editable only in vault),
  **jade = project-native**.

## Data contracts (backend reads)

| Data | Path | Key fields |
|---|---|---|
| Registry | `<vault>/projects/*.md` frontmatter | name, path, stack, kuraka_version, has_project_layer, default_mode, focus_scope, status, last_mount, last_sync, tags |
| Agents | `<vault>/agents/*.md` frontmatter | name, description, model (opus\|sonnet\|haiku), color |
| Project config | `<project.path>/kuraka.config.yaml` | project, stack.*, architecture.{layers,paths}, conventions.*, workflow.* |
| Project layer | `<project.path>/.claude/project/{conventions,review-checks,agents,lessons-learned}/`, `glossary.md` | files |
| RECURRING-ISSUES | `<...>/docs/process/RECURRING-ISSUES.md` | Executive Summary + Top N Patterns |
| Triage | `<vault>/retro-triage/*.md` frontmatter + table | fm: project, source, date, decision, applied; table: #/Finding/Routing/Target/Severity/Status |
| Telemetry | `<project.path>/docs/process/agent-telemetry/*-telemetry.json` | req_name, mode, runs[].{agent, total_tokens, tool_uses, duration_ms} |
| Budgets | `<vault>/aggregate-telemetry.py` BUDGETS | {agent: (target, hard_cap)} (13 agents) |

No `*-telemetry.json` exists today → the telemetry view starts empty.

## Governance actions → vault scripts

| Action | Backend | Contract |
|---|---|---|
| Onboard project | `python3 kuraka-init.py --target --name [--yes]` | runs inspect → drafts config → skeleton → mount → upsert registry; idempotent |
| Mount Kuraka | `mount-kuraka.sh <target>` | exit 0/1; warnings; `requires_restart` |
| Validate frontmatter | `validate-kuraka.sh <target>` | exit 0/1; per-agent errors |
| Detect stack | `python3 kuraka-inspect.py <target>` | JSON on stdout |
| Regenerate telemetry | `python3 aggregate-telemetry.py <project_root>` | writes DASHBOARD.md (planned `--registry` mode for cross-project) |
| Create triage | direct write `retro-triage/<date>-<project>.md` from `_TEMPLATE.md` | — |
| Apply patch | direct write to `agents/*.md` (framework) or `<project>/.claude/project/...` | — |

## RETRO improvement loop (the state machine must close on verification)

State model (● = required state; the loop must CLOSE on verification, not on
apply):

```
SinTriar → Enrutado(marco|proyecto)[human] → Aplicado[human] → Sincronizado
         → PendienteVerificación● → Verificado● (terminal ✓) | Regresado● (reopen → re-route)
Exceptions: Diferido · Rechazado(reabrible) · Supersedido●(dedup) · ApplyFailed●
            · ParcialmenteSincronizado●(marco k/N) · Revertido●(rollback)
```

- **RL-1 Verification join.** Each `pattern-detector` run READS the triage
  store, reconciles `PendienteVerificación` cards (absent next cycle →
  `Verificado`; present → `Regresado`), THEN emits new findings. Without this
  the loop does not close.
- **RL-2 "Verificado" definition.** A finding absent for **K=2 consecutive
  cycles** (K configurable), with optional human sign-off, defines the
  `Verificado` terminal.
- **RL-3 Framework fan-out is k/N, not atomic.** Mount-to-all respects
  per-project state (skip mid-cycle / pinned / wrong-branch) and records the
  framework version per project (`ParcialmenteSincronizado`).
- **RL-4 Framework apply is never fully automated.** Routing + project apply may
  be one-click; framework apply + mount-to-ALL requires explicit human confirm
  (blast radius). Mounts deferred to cycle boundaries.
- **RL-5 Conflict serialization.** Block apply when a sibling card targets the
  same file; re-validate the patch against the current file at apply time.
- **RL-6 Firewall.** Project-route sync is backup-only — never re-mounted to
  other projects.
- **RL-7 Finding identity.** Stable signature key emitted by `pattern-detector`
  (normalized target-symbol-class + symptom-class), with manual link override —
  enables dedup + recurrence detection.

## Build order (reference only — see spec-v1 §6; do not re-derive)

Critical path (MVP of observe + act): **S12 → S1 → S2 → S3 → S4 → S5 → S7**.
Then S6 (telemetry), S8 (Resumen/Monitor + live-state watcher, spike first),
S9 (Agentes catalog), S11 (Onboard wizard), S10 (cross-project verification
join + dedup). Refine each with `story-refiner`.

## Initial domain vocabulary (for arki to seed `.claude/project/glossary.md`)

- **Vault**: the Obsidian directory at `KURAKA_VAULT`, source of truth for the
  framework (registry, agents, triage).
- **Control plane / Data plane**: govern (vault + this app) vs develop (inside
  each project).
- **Hub-and-spoke**: develop in projects, govern from the vault.
- **Framework agent**: agent owned by the vault (`agents/*.md`), gold, editable
  only here.
- **Project layer**: a project's `.claude/project/` overrides, jade,
  project-native.
- **Drift**: difference between a project's mounted Kuraka version and the
  vault's current version.
- **Mount**: applying the vault framework into a project (`mount-kuraka.sh`),
  vault→project, read-only copies.
- **Triage**: routing a RETRO finding to framework vs project and applying it.
- **Finding / pattern**: an issue surfaced by `pattern-detector` into
  `RECURRING-ISSUES.md`.
- **Verification join**: the reconciliation step where a new detector run closes
  or reopens pending triage cards.
- **Quipu en vivo**: the live agent-state hero on the Monitor screen.

## Open questions (for arki or follow-up with user)

1. **Live-state watcher mechanism (S8).** The "Quipu en vivo" needs a new
   real-time source ("agent X in phase Y now"). The spec marks this as added
   scope requiring a tech spike but does not fix the transport (file-watch over
   N external repos vs IPC vs polling) or the event source emitting agent
   phase. arki should scope the spike; the transport choice is open.
2. **Agent catalog count.** Brief KPI / spec mockup reference "16" agents in
   the catalog, while the budgets contract lists "13 agents" in
   `aggregate-telemetry.py` BUDGETS. Confirm whether catalog (16) and budgeted
   (13) are intentionally different sets (e.g. 3 agents without budgets) — does
   not affect architecture, but the UI count source should be unambiguous.
3. **`pattern-detector` ownership.** RL-1/RL-7 assign new behavior to
   `pattern-detector` (read triage store, emit stable signature keys, reconcile
   pending cards). Confirm whether this agent change is in scope for
   kuraka-control's v1 or is a separate framework-agent change applied through
   the triage flow itself.
