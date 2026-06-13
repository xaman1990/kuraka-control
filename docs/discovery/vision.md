# kuraka-control — Vision

## One-liner

Local single-user control plane to govern the Kuraka framework across all
consumer projects: develop in projects, govern from the vault.

## User & value

Carlos is the sole operator of the Kuraka framework, which is mounted across
several consumer projects (dbcanvas, sie_v2, and this repo itself). Today the
feedback from each development cycle (RETRO → `RECURRING-ISSUES`) is turned into
agent improvements **by hand** — the manual P1–P6 exercise. There is no single
view of all projects, no clear picture of which agent is framework vs a
project override, and no auditable flow to route and apply improvements.
kuraka-control gives Carlos one place to **observe** the whole fleet and
**act** on the improvement loop with a traceable, governed workflow.

## Governance model (hub-and-spoke)

Two deliberately separated planes:

- **Data plane (develop)** — inside each consumer project: agents run, read
  `kuraka.config.yaml` + `.claude/project/`, write code, produce RETROs and
  telemetry.
- **Control plane (govern)** — this app + the vault: project registry,
  framework agents (source of truth), RETRO triage, cross-project telemetry.

The boundary: the vault owns `agents/*.md` (framework, editable **only** from
here); each project owns its `.claude/project/` layer (project-native).

## Business model

Internal single-operator tool. No revenue, no auth, no multi-tenant. This repo
is also the first greenfield project dogfooded with Kuraka (Bootstrap:
inti → arki → Normal).

## Scope — v1 = OBSERVE + ACT

**Observe**
- Projects list from the vault registry (`projects/*.md`).
- Agent catalog with governance badge (framework vs project override).
- Project detail: config + `.claude/project/` layer (read live) + version drift.
- RETRO / `RECURRING-ISSUES` feed.
- Cross-project telemetry (may start empty — no telemetry JSON exists yet).

**Act**
- RETRO triage board: route each finding framework-vs-project and apply the
  patch to the correct target file — systematizes P1–P6.
- Governance action runner: mount / validate / inspect / regenerate telemetry.
- Onboard wizard wrapping `kuraka-init.py`.

## Out of scope (v1)

- Multi-user, auth, remote deploy.
- Editing `backend/` or `frontend/` of consumer projects (that happens inside
  each project via Kuraka).
- Replacing Obsidian.
- Wrapping the deprecated `sync-obsidian.sh`; project→vault backup is deferred.

## Success criteria

- Carlos sees every registered project, its mounted Kuraka version, and live
  drift vs the vault from one screen.
- Every agent is unambiguously shown as framework (gold) or project-native
  (jade), and framework agents are editable only here.
- A RETRO finding can be routed, applied, and tracked through to a closed
  state — the improvement loop **closes on verification**, not on apply.
- Governance scripts (mount / validate / inspect / aggregate-telemetry) run
  from the UI with their output and exit code surfaced; no silent failure.
