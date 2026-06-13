# ADR-006 — Direct-write firewall

**Status:** accepted · **Date:** 2026-06-07

## Context
C2/C4/C6 sharply constrain what the app may **write**:
- Mutations go through existing scripts **when one exists**.
- **Direct writes** are limited to: `retro-triage/*.md` (triage records) and the
  **destination files of an applied patch** — either a framework agent
  (`<vault>/agents/*.md`) or a project layer file
  (`<project>/.claude/project/...`).
- Consumer projects are **read-only** except those explicit patch targets (C4).
- **Never** wrap the deprecated `sync-obsidian.sh` (C3).
- Framework agents are writable **only from this app** (C6).

## Decision
A single **`WriteFirewall`** module is the *only* code path allowed to call
`fs.writeFile`. Every other module reads, or shells out to a script (adr-005).
The firewall enforces an **allowlist of write classes**:

| Write class | Allowed target glob | Guard |
|-------------|--------------------|-------|
| `triage_record` | `<vault>/retro-triage/*.md` | filename `^\d{4}-\d{2}-\d{2}-<slug>\.md$` |
| `framework_patch` | `<vault>/agents/*.md` | **requires explicit human-confirm token** (RL-4, blast radius) |
| `project_patch` | `<project.path>/.claude/project/**` | path must be inside a *registered* project root |

Hard denials (throw, never write):
- any path resolving outside the three allowed roots (path traversal);
- any consumer `backend/` or `frontend/` path (C4);
- `scripts/sync-obsidian.sh` or anything under a `sync-obsidian` invocation (C3);
- a `framework_patch` without a confirm token (C6/RL-4).

Apply-time guards from the state machine:
- **RL-5 conflict serialization:** refuse a patch when a sibling triage card
  targets the same file; re-read the target and re-validate the patch against
  current content before writing.
- **RL-6 firewall:** a project-routed patch is backup-only — never triggers a
  mount to other projects.

## Rationale
Centralizing writes in one audited module makes C2–C6 a **compile-time-visible
invariant**, not a convention scattered across services. A reviewer checks one
file. Mirrors the framework's own "no writes to backend/ before Phase 4"
orchestrator invariant.

## Consequences
- `framework_patch` + mount-to-ALL is a two-step UI flow (route+apply one-click
  for project; framework needs the confirm token) — RL-4 honored in code.
- Triage record creation seeds from `<vault>/retro-triage/_TEMPLATE.md`.
