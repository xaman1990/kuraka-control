# Domain model — kuraka-control

There is **no database**. Entities are projections of files on disk (adr-003).
This documents the shapes the `domain` layer parses into and the RETRO state
machine.

## Entities (read projections)

| Entity | Source | Key fields |
|--------|--------|-----------|
| **Project** (registry entry) | `<vault>/projects/*.md` fm | name, path, repo_url, stack, kuraka_version, has_project_layer, default_mode, focus_scope, status, last_mount, last_sync, tags |
| **Agent** (catalog) | `<vault>/agents/*.md` fm | name, description, model (opus\|sonnet\|haiku), color, **governance=framework** |
| **AgentOverride** | `<project>/.claude/project/agents/*.append.md` | agent name, governance=project |
| **ProjectConfig** | `<project>/kuraka.config.yaml` | stack.*, architecture.{layers,paths}, conventions.*, workflow.* |
| **ProjectLayerNode** | `<project>/.claude/project/{conventions,review-checks,agents,lessons-learned}/**`, `glossary.md` | path, kind, governance=project |
| **RecurringIssues** | `<project>/docs/process/RECURRING-ISSUES.md` | exec summary + Top-N patterns |
| **TriageRecord** | `<vault>/retro-triage/*.md` | fm{project, source, date, decision, applied}; table rows{#, finding, routing, target, severity, status} |
| **TelemetryCycle** | `<project>/docs/process/agent-telemetry/*-telemetry.json` | req_name, mode, runs[].{agent, total_tokens, tool_uses, duration_ms} |
| **Budget** | `BUDGETS` in `<vault>/aggregate-telemetry.py` | {agent: (target, hard_cap)} |
| **LiveState** | watcher (adr-004) | per-project {agent, phase, req, ts} |

## Drift
`Drift = compare(project.kuraka_version, vault.current_version)`.
Vault current version source: TBD at S2 (candidate: a `VERSION`/`kuraka.lock`
in the vault). Result: `up_to_date | behind(n) | ahead | unknown`.

## Agent counts (open question #2 — RESOLVED)
- **Catalog = 16** files in `<vault>/agents/`.
- **Budgeted = 13** in the `BUDGETS` dict.
- The 3 unbudgeted = bootstrap/meta agents **amauta, arki, inti** (run outside the
  token-budgeted REQ pipeline).
- UI: catalog count from `agents/*.md`; "running now" from LiveState; budget bars
  only for agents in `BUDGETS`. The KPI must label which number is which
  (FR-1.1: "16 catalog vs N running").

## RETRO improvement loop (state machine — must CLOSE on verification)

Typed union (`enums_for_states: true`). ● = required state.

```
SinTriar
  → Enrutado(marco|proyecto)   [human, RL-4]
  → Aplicado                   [human]
  → Sincronizado
  → PendienteVerificación ●
  → Verificado ● (terminal ✓)  | Regresado ● (reopen → re-route)
Exceptions:
  Diferido · Rechazado(reabrible) · Supersedido ●(dedup)
  · ApplyFailed ● · ParcialmenteSincronizado ●(marco k/N) · Revertido ●(rollback)
```

Invariants the domain encodes:
- **RL-1 Verification join** — each `pattern-detector` run reads the triage store,
  reconciles `PendienteVerificación` (absent next cycle → `Verificado`; present →
  `Regresado`), then emits findings. The loop closes here, not at apply.
- **RL-2 Verificado** — absent for **K=2 consecutive cycles** (K configurable) +
  optional human sign-off.
- **RL-3 / ParcialmenteSincronizado** — framework fan-out is **k/N**: mount-to-all
  skips per-project state (mid-cycle/pinned/wrong-branch) and records framework
  version per project.
- **RL-4** — framework apply + mount-to-ALL needs explicit human confirm token
  (adr-006); routing + project apply may be one-click.
- **RL-5 Conflict serialization** — block apply if a sibling card targets the same
  file; re-validate at apply time.
- **RL-6 Firewall** — project-route sync is backup-only.
- **RL-7 Finding identity** — stable signature key (normalized target-symbol-class
  + symptom-class) with manual link override; enables dedup + recurrence.

> **Open question #3 (pattern-detector ownership)** — RL-1/RL-7 assign new behavior
> to the `pattern-detector` agent (read triage store, emit signature keys,
> reconcile pending cards). This is a **framework-agent change**, not a stack
> decision. **Deferred to story refinement** (S10): decide whether it ships inside
> kuraka-control's v1 or is applied as a framework patch *through* this app's own
> triage flow. Not a bootstrap blocker.
