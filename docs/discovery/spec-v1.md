# kuraka-control — Spec v1 (OBSERVE + ACT)

> Authoritative build input for `arki` + the dev cycles. Complements `brief.md`
> (vision + architecture constraints) and the validated mockups in the Kuraka vault's
> `pencil-new.pen`. Reviewed with the `po-analyst` lens (see §5–6).

## 1. What we're building

A local single-user web dashboard to **govern the Kuraka framework across consumer
projects** (hub-and-spoke: develop in projects, govern from the vault). v1 = **observe + act**.

- **Backend**: Node + Express. Only piece with fs access + shell-out to vault scripts.
  Reads each registered project **live** (walks its `path`), wraps `kuraka-init.py` /
  `mount-kuraka.sh` / `validate-kuraka.sh` / `kuraka-inspect.py`, writes `retro-triage/*.md`
  and patch targets.
- **Frontend**: React + Vite + Zustand. Consumes the backend API.
- Vault read from `KURAKA_VAULT` (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`).
- Single local user, no auth. Does NOT wrap the deprecated `sync-obsidian.sh`.

## 2. Screens (validated mockups in `pencil-new.pen`)

| Screen | Purpose | Key data | Primary actions |
|--------|---------|----------|-----------------|
| **Resumen / Monitor** | Pulse of everything | registry, telemetry, live agent state (watcher) | Onboard project |
| **Project Detail** | Review what a project contains | config + `.claude/project/` (live fs) + drift vs vault | Re-mount, Validate, Sync |
| **RETRO Triage** | Act on the improvement loop | RECURRING-ISSUES + `retro-triage/*.md` | route (marco/proyecto), apply, defer |
| **Agentes** | Catalog + governance | `agents/*.md` + per-project overrides | edit framework agent (only here) |
| **Onboard wizard** | Mount Kuraka in a new project | `kuraka-inspect` output | run `kuraka-init.py` pipeline |

Design system (in the .pen): Andean "Quipu" theme — obsidian + gold (Inti) + jade.
Tokens: `bg/surface/surface-2/border/text/text-2/text-3/accent/jade/cord` + per-agent
colors `ag-*`. Components: MetricCard, ProjectCard, AgentCard, NavItem, Badge.
**Two-color governance convention everywhere**: gold = framework (editable only in vault),
jade = project-native.

## 3. The improvement loop (corrected state model)

Triage card states (● = required; the loop must CLOSE on verification):

```
SinTriar → Enrutado(marco|proyecto)[human] → Aplicado[human] → Sincronizado
         → PendienteVerificación● → Verificado● (terminal ✓) | Regresado● (reopen→re-route)
Exceptions: Diferido · Rechazado(reabrible) · Supersedido●(dedup) · ApplyFailed● ·
            ParcialmenteSincronizado●(marco k/N) · Revertido●(rollback)
```

Rules:
- **Verification join**: each `pattern-detector` run READS the triage store, reconciles
  `PendienteVerificación` cards (absent next cycle → Verificado; present → Regresado), THEN
  emits new findings. Without this the loop doesn't close.
- **Framework fan-out is k/N, not atomic**: mount-to-all respects per-project state (skip
  mid-cycle / pinned / wrong-branch), records framework version per project.
- **Conflict serialization**: block apply when a sibling card targets the same file;
  re-validate patch against current file at apply time.
- **Firewall**: project-route sync is backup-only — never re-mounted to other projects.

## 4. Data contracts (backend reads)

| Data | Path | Fields |
|------|------|--------|
| Registry | `<vault>/projects/*.md` fm | name, path, stack, kuraka_version, has_project_layer, default_mode, status, last_mount, last_sync |
| Agents | `<vault>/agents/*.md` fm | name, description, model, color |
| Project config | `<project.path>/kuraka.config.yaml` | stack, architecture.paths, conventions, workflow |
| Project layer | `<project.path>/.claude/project/{conventions,review-checks,agents,lessons-learned}/`, glossary.md | files |
| RECURRING-ISSUES | `<...>/docs/process/RECURRING-ISSUES.md` | patterns |
| Triage | `<vault>/retro-triage/*.md` fm + table | project, source, date, decision, applied, routing |
| Telemetry | `<project.path>/docs/process/agent-telemetry/*-telemetry.json` | req_name, mode, runs[].{agent,total_tokens,tool_uses,duration_ms} |

## 5. Resolved decisions (defaults — arki may revisit)

- **Architecture (locked)**: sibling repo, Node+Express backend, React+Vite+Zustand front,
  reads each project live, **live agent-state via a watcher** (new mechanism — its own story
  with a tech spike), mutations wrap existing scripts.
- **"The fix worked" = Verificado**: finding absent for **K=2 consecutive cycles** (K
  configurable), with optional human sign-off. → defines the `Verificado` terminal.
- **Framework apply is NEVER fully automated**: routing + project apply can be one-click;
  **framework apply + mount-to-ALL requires explicit human confirm** (blast radius). Mounts
  deferred to cycle boundaries.
- **Finding identity**: stable signature key emitted by `pattern-detector`
  (normalized target-symbol-class + symptom-class); manual link override. → enables dedup +
  recurrence detection.

## 6. Build order (stories — refine with story-refiner)

Critical path (MVP of observe+act): **S12 → S1 → S2 → S3 → S4 → S5 → S7**.

| # | Story | Cx |
|---|-------|----|
| S12 | Design system + two-color convention + tokens (from the .pen) | S |
| S1 | Registry reader + Projects list → detail route | M |
| S2 | Project Detail header + drift indicator (live version vs vault) | M |
| S3 | Project Detail Tab 1 — Config/Overview | S |
| S4 | Project Detail Tab 2 — Project Layer browser (tree + preview) | L |
| S5 | RETRO Triage — board + card detail + route/apply (corrected states) | L |
| S7 | ACT runner — shell-out to mount/validate/inspect with output panel | M |
| S6 | Telemetry (parse `*-telemetry.json`, budget bars) | M |
| S8 | Resumen/Monitor + Quipu + **live-state watcher (spike first)** | L |
| S9 | Agentes catalog + agent detail (governance) | M |
| S11 | Onboard wizard (wraps `kuraka-init.py`) | M |
| S10 | Cross-project verification join + dedup in triage | L |

Empty/error states are first-class (po-analyst: "no silent failure").
```
