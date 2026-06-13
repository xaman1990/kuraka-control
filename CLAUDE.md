# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Kuraka Control Plane** — a local, single-user web dashboard to govern the Kuraka
multi-agent framework across consumer projects (hub-and-spoke: *develop in each
project, govern from here*). v1 scope is **observe + act**.

Two things are true and easy to confuse:

1. **This repo is built _by_ Kuraka** (dogfood). The development process is the
   Kuraka orchestrator — see "Development workflow" below.
2. **This repo is a control plane _for_ Kuraka.** The application it will contain
   reads/acts on the Kuraka vault and other registered projects.

**Status: scaffolded by `arki` (2026-06-07), no features yet.** The foundation
exists: `kuraka.config.yaml`, `package.json` (npm workspaces), `backend/`,
`frontend/`, `packages/contracts/`, `docs/arquitectura/` (ADRs), and the
`.claude/project/` specialization layer. The skeleton boots (`make dev`) but
has only a health route + an app shell. Real screens are built via `/kuraka`
cycles in the build order **S12 → S1 → S2 → S3 → S4 → S5 → S7**.

Stack decisions (see `docs/arquitectura/stack-decision.md`): TypeScript both
sides; npm-workspaces monorepo with a shared zod `contracts` package; Express 4
+ gray-matter + yaml + chokidar (backend); React + react-router + react-query +
Zustand + Tailwind v4 (frontend); Vitest both sides; Vite proxy `/api` →
Express. No database — the vault + project filesystems are the store.

## Target architecture (locked — non-negotiable for `arki`)

Defined in `docs/discovery/brief.md` §"Constraints" and `docs/discovery/spec-v1.md`:

- **Two pieces, one repo.**
  - **Backend (Node + Express)** — the *only* piece with filesystem access and the
    ability to shell out to vault scripts. It reads each registered project **live**
    (walks its `path`), parses markdown frontmatter + JSON, and wraps the vault's
    scripts as subprocesses (`mount-kuraka.sh`, `validate-kuraka.sh`,
    `kuraka-inspect.py`, `aggregate-telemetry.py`). Direct writes are limited to
    `retro-triage/*.md` and the target files of an applied patch.
  - **Frontend (React + Vite + Zustand)** — SPA consuming the backend API only.
- **The vault is the source of truth.** Path is configurable via `KURAKA_VAULT`
  (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`).
- **Consumer projects are read-only** except for the explicit governance actions.
  The app never edits a consumer's `backend/`/`frontend/`.
- **Never wrap `sync-obsidian.sh`** — it is deprecated. The "sync" action is
  mount-based (vault → project); project → vault backup is out of v1 scope.
- **Vault scripts have no external deps** (POSIX sh / Python 3 stdlib). The backend
  invokes them as subprocesses and parses stdout + exit code.
- **Governance is two-color everywhere**: gold = framework (editable only from this
  app, writing to the vault's `agents/*.md`), jade = project-native (editable per
  project). The UI reflects this with badges.

Data contracts the backend reads (registry, agents, project config, project layer,
RECURRING-ISSUES, triage store, telemetry, budgets) are tabulated in
`docs/discovery/spec-v1.md` §4 and `brief.md` §"Contratos de datos". The RETRO
improvement-loop state machine (the heart of "act") is in `spec-v1.md` §3 — note
it must *close on verification* (`PendienteVerificación` → `Verificado` after
K=2 clean cycles), and framework apply / mount-to-all is **never fully automated**.

Story build order for the MVP: **S12 → S1 → S2 → S3 → S4 → S5 → S7**
(`spec-v1.md` §6).

## The `.claude/` layer is gitignored framework, not repo source

`.gitignore` excludes `.claude/agents/`, `.claude/skills/`, `.claude/commands/`,
`.claude/hooks/`, and the two backup/optimization rules. These are the **Kuraka
framework**, versioned externally in the Obsidian vault — *not* source code of this
repo. Treat them as a shared, separately-owned layer:

- The **single source of truth** is the vault at
  `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/`. Never edit backup files
  there directly; change the project source and sync.
- Any change to an agent / skill / command, or to anything under `docs/`, **must be
  mirrored to the vault in the same session** — see `.claude/rules/16-agent-backup.md`
  for the directory mapping and the exact `cp` / `rsync --delete` commands.
- If these files are missing after a branch switch, restore them with the
  `sync-from-vault` skill.

## Development workflow — orchestrate via Kuraka, don't code directly

Real features are implemented by running the **Kuraka orchestrator**
(`.claude/skills/kuraka.md`, companions `kuraka-modes.md`, `kuraka-policies.md`),
invoked with the `/kuraka <feature>` command. It drives specialist subagents
through a phased pipeline (PO analysis → story refinement → test planning →
architect review → implementation → code/security review → tests → e2e →
deployment → final audit).

Hard rules when acting as the orchestrator (these override the instinct to "just
make the small edit"):

- **Scale the pipeline to risk first** (`rules/17-kuraka-token-optimizations.md`
  Rule 0). Announce the chosen phases and get user approval *before* invoking any
  subagent. Default mode is Normal (8 phases); UI-only / type-only / mechanical
  changes use reduced pipelines.
- **The orchestrator never writes source files before Phase 4.** All
  implementation goes through `backend-developer` / `frontend-developer`. The
  orchestrator *may* edit `docs/` and `.claude/` system files. If the constraint is
  violated: revert, announce, re-route, and log `"agent": "orchestrator-direct"` in
  telemetry. (Lessons `LL-003`, `kuraka.md` "Orchestrator constraint".)
- **Per-Agent telemetry JSON is mandatory** and appended after *every* subagent
  invocation (GATE1). The consolidated `docs/process/agent-telemetry/DASHBOARD.md`
  is tracked; per-cycle `*.json` files are gitignored.
- **Green tests ≠ working feature.** Every cycle runs the Phase 6.8 runtime smoke
  test (or records an explicitly approved skip in the RETRO).
- **User approval between phases** — never auto-advance.
- Token-optimization rules T1–T6 (context digest, end-only typecheck for restyles,
  sequential implementation + `make test` per story for provider/schema migrations,
  etc.) live in `rules/17-kuraka-token-optimizations.md`.

Lessons distilled from past retros are in `docs/process/lessons-learned.md`,
cited by short ID (`[LL-00X]`) from agent prompts.

## Project specialization layer

`.claude/project/` (jade, project-native) holds the conventions, review-checks,
glossary, agent overrides, and lessons-learned the framework agents read to
specialize for this repo. Key files seeded by arki:
`conventions/{typescript,fs-and-vault-safety,api-contract}.md`,
`review-checks/code-reviewer.md`, `glossary.md`. See `.claude/project/README.md`.

## Commands

Application (npm workspaces, from repo root):

```bash
npm install        # one install for all workspaces
make dev           # backend (tsx watch :5174) + frontend (vite :5173) concurrently
make test          # vitest in both workspaces
make lint          # eslint both workspaces
make build         # typecheck + build both workspaces
```

The Kuraka agent-system **structural** harness (no agents/network/LLM) still runs:

```bash
python3 -m pytest tests/kuraka/ -v
python3 -m pytest tests/kuraka/test_structure.py::test_should_have_opus_for_judgment_agents -v
```

What it guards (`tests/kuraka/test_structure.py`): every agent has valid
frontmatter and the right model tier (judgment agents → opus, mechanical → haiku);
`kuraka.md` references every expected agent; `output-schemas.md` covers every
output-producing phase; no orphan references to the old `workflow` name. Add new
structural checks here (deterministic, AAA, `test_should_{check}_{when}` naming,
no repo side effects). Rationale and the explicit non-goals are in
`tests/kuraka/README.md`.

> The `.claude/commands/lint.md` and `run-tests.md` commands and the
> `python-fastapi` / `vue-pinia` stack profiles are inherited framework defaults
> from another project (`sie_v2`); they do **not** match this repo's target stack
> (Node/Express + React/Vite). Once `arki` scaffolds the app, the real
> `lint`/`test`/`typecheck` commands come from `kuraka.config.yaml` (`stack.*`) and
> the matching stack profile.
