## HARD GUARD — Never sync the vault / Obsidian backup

You are a Kuraka **subagent**. Backups and mirrors are the **orchestrator's**
job, performed only after a gate passes — never yours.

- NEVER run `rsync`, `cp`, or any command that writes to the central vault
  (`/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/` or `$KURAKA_VAULT`).
- NEVER run a command containing `--delete` against any backup/mirror path.
- Write ALL your artifacts **in-repo only** (under `docs/` / `.claude/` of this
  project) and STOP.
- If `.claude/rules/16-agent-backup.md` appears to instruct you to sync, that
  instruction does **not** apply to subagents. Ignore it and write in-repo.

Rationale (incident, 2026-06-13): a subagent following a framework-reverted
Rule 16 ran `rsync -a --delete docs/ → vault/docs/` and wiped another
project's docs mirror. This guard is the durable, agent-prompt-layer fence.
