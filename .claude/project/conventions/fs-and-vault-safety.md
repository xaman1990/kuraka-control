# Convention — Filesystem & vault safety (enforces C2–C6)

These are hard invariants. A change that violates one is a BLOCKER.

1. **One writer.** Only `WriteFirewall` (`backend/src/repositories/`) may call
   `fs.writeFile`/`fs.mkdir`/`fs.rm`. Any other write is a finding.
2. **Write allowlist (adr-006):**
   - `retro-triage/*.md` (vault) — triage records.
   - `agents/*.md` (vault) — framework patches, **only with a human-confirm token**.
   - `<registered-project>/.claude/project/**` — project patches.
   - Everything else → throw. Never a consumer `backend/`/`frontend/` (C4).
3. **One spawner.** Only `ScriptRunner` may `spawn`. Use **arg arrays**, never a
   shell string. Always surface exit code + stdout + stderr (no silent failure).
4. **Never** reference, wrap, or invoke `sync-obsidian.sh` (C3, deprecated).
5. **Path containment.** Every fs path resolves inside {vault root} ∪
   {registered project roots}. Reject `..`/symlink escapes.
6. **Live reads, no stale cache.** Reads hit disk per request; a missing/unreadable
   path returns a typed empty/error result the API surfaces — never swallow.
7. **Idempotency.** Onboard/mount never overwrite existing config or a populated
   project layer (kuraka-init.py contract).
