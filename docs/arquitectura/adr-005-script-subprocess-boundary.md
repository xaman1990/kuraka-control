# ADR-005 — Vault-script subprocess boundary

**Status:** accepted · **Date:** 2026-06-07

## Context
Governance actions are implemented by **existing vault scripts** with no external
deps (C5: POSIX sh / Python 3 stdlib). The backend must NOT reimplement their
logic — it invokes them and surfaces **stdout + exit code** (FR-X.1; NFR "no
silent failure").

Verified CLI contracts (from the vault, 2026-06-07):

| Action | Invocation | Output contract |
|--------|-----------|-----------------|
| Onboard | `python3 kuraka-init.py --target <dir> --name <slug> [--yes] [--mode normal]` | runs inspect→draft→skeleton→mount→registry upsert; idempotent |
| Mount | `bash mount-kuraka.sh <target>` | exit 0/1; warnings; prints `requires_restart` instruction |
| Validate | `bash validate-kuraka.sh <target>` | exit 0/1; per-agent errors on stdout |
| Inspect | `python3 kuraka-inspect.py <target>` | **JSON on stdout** (positional arg) |
| Telemetry | `python3 aggregate-telemetry.py <project_root>` | writes DASHBOARD.md; positional `argv[1]` (no `--registry` mode yet) |

## Decision
- A single **`ScriptRunner`** repository wraps `child_process.spawn` (never
  `exec`/shell-string — args as an array, no shell interpolation).
- Each script has a typed wrapper in `services/governance` that knows its arg
  shape, whether stdout is JSON (inspect) or text (mount/validate), and maps
  exit code → result status.
- The runner **streams** stdout/stderr to the output panel (S7) and returns the
  final `{ exitCode, stdout, stderr, durationMs }`. Long-running actions (mount,
  init) stream incrementally.
- `KURAKA_VAULT` env is passed through to child processes; scripts resolve their
  own vault root.
- **Per-action timeout** + the run is cancellable from the UI.

## Notes on contract gaps (flag to user / story refinement)
- `aggregate-telemetry.py` has **no `--registry` cross-project mode today** — it
  takes one `project_root`. v1 cross-project telemetry (S6/S10) iterates the
  registry and runs it per project, or reads the per-project JSON directly.
  The `--registry` mode is a *planned* framework enhancement; do not assume it.
- `kuraka-init.py` is **idempotent** (never overwrites existing config or a
  populated project layer) — the wizard (S11) relies on this; surface its TODO
  output (restart Claude Code → run `amauta`).

## Consequences
- Zero duplication of governance logic; the scripts stay the single
  implementation (C5).
- All script calls are auditable: exit code + output always shown (NFR).
