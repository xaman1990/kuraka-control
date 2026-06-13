# ADR-003 — Live filesystem read strategy

**Status:** accepted · **Date:** 2026-06-07

## Context
The backend must read, **live on every request**, three filesystems (C2/C4):
1. The **vault** at `KURAKA_VAULT` — registry (`projects/*.md`), agents
   (`agents/*.md`), triage (`retro-triage/*.md`), budgets (in
   `aggregate-telemetry.py`).
2. Each **registered project** by walking its `path` from the registry —
   `kuraka.config.yaml`, `.claude/project/**`, `docs/process/RECURRING-ISSUES.md`,
   `docs/process/agent-telemetry/*-telemetry.json`.
3. **Drift** = mounted `kuraka_version` (read from project fs) vs vault current.

"Live" means: no caching layer that can go stale silently; the operator edits a
file in Obsidian/an IDE and the UI reflects it on next fetch (NFR: no silent
failure; FR-2.3 "read live").

## Decision
- A **`repository` layer** of read adapters, each pure I/O + parse:
  - `VaultRepository` — reads vault paths, parses frontmatter via **gray-matter**.
  - `ProjectRepository` — given a registry entry, walks the project path,
    parses `kuraka.config.yaml` via **yaml**, reads the project layer tree.
  - `TelemetryRepository` — globs `*-telemetry.json`, `JSON.parse`.
  - `BudgetRepository` — extracts the `BUDGETS` dict from
    `aggregate-telemetry.py` (regex/AST-lite parse; 13 budgeted agents).
- **Read on request, no persistent cache.** Optional short-lived per-request
  memoization only. A directory that is missing/unreadable returns a typed
  empty/error result the API surfaces explicitly (never a swallowed exception).
- All reads go through a **path resolver** that refuses to escape the allowed
  roots (vault root + each registered project root). See adr-006.

## Rationale
- The fleet is ~3 projects of small markdown/JSON files → full reads per request
  are cheap; correctness (always-fresh) beats a cache that can lie.
- gray-matter + yaml are pure-JS, no native build; align with C5's "no external
  native deps" spirit on our side too.

## Consequences
- Cross-project aggregation (telemetry, dedup) is O(files) per request. Fine for
  v1; if the registry grows, add an in-memory index invalidated by the watcher
  (adr-004) — not before. Recorded as a future lever, not built now.
- The 16-vs-13 agent question (open #2) is answered here: **agent catalog = 16**
  files in `<vault>/agents/`; **budgeted = 13** in the `BUDGETS` dict. The 3
  unbudgeted are the bootstrap/meta agents `amauta`, `arki`, `inti`. The UI count
  source is unambiguous: catalog count from `agents/*.md`, budget bars only for
  agents present in `BUDGETS`. See domain-model.md.
