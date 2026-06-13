# Lessons Learned — INDEX (kuraka-control)

No lessons yet (greenfield). Each RETRO that produces a durable, project-scoped
lesson gets an `LL-NNN-<slug>.md` file and a row here.

| ID | Date | Title | Source RETRO | Severity |
|----|------|-------|--------------|----------|
| _(none yet)_ | | | | |

## Seed lessons carried from the framework (context, not incidents)
- **Append-path correctness** — agent overrides must live at
  `.claude/project/agents/<agent>.append.md` (mount-respected), NOT
  `.claude/agents/*.append.md` (mount-excluded). From the sie_v2 triage
  (2026-06-06): patches authored at the wrong path were inert.
