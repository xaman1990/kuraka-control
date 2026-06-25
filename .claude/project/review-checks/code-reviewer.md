# Review checks — code-reviewer (kuraka-control)

Project-specific checks appended to the framework code-reviewer. Seeded by arki;
grow from retros.

## 1. Vault/fs safety (BLOCKER)
- [ ] No `fs.write*`/`rm`/`mkdir` outside `WriteFirewall`.
- [ ] No `spawn`/`exec` outside `ScriptRunner`; args passed as arrays, not shell strings.
- [ ] No reference to `sync-obsidian.sh` anywhere (C3).
- [ ] Writes hit only the allowlist (triage, agents-with-token, project-layer); no consumer `backend/`/`frontend/` path (C4).
- [ ] Every fs path passes through the path-containment resolver.

## 2. No silent failure (BLOCKER)
- [ ] Every script run surfaces exit code + stdout + stderr.
- [ ] Every read error returns a typed error envelope; nothing swallowed.
- [ ] Empty collections return an explicit empty state, not a 404/throw.

## 3. Contract integrity
- [ ] Request validated by a `packages/contracts` zod schema at the route.
- [ ] No hand-redeclared type that duplicates a contract.

## 4. Governance correctness
- [ ] Framework write (`agents/*.md`) requires the human-confirm token (RL-4).
- [ ] Apply blocked when a sibling triage card targets the same file (RL-5).
- [ ] Catalog count uses `agents/*.md` (16); budget bars only for `BUDGETS` agents (13).

## 5. Layering
- [ ] Routes don't touch fs/subprocess directly; only repositories do I/O.
- [ ] `domain/` is pure (no fs/spawn/env).

## 6. Frontend design tokens
- [ ] Every CSS custom property a component references (`var(--x)`) is defined in
      `frontend/src/theme/tokens.css` — a `var(--x, fallback)` silently relying on the
      fallback because `--x` is undefined is a token-hygiene gap (MINOR). [S3 `--radius-card`]

## 7. Filesystem walks (symlink classification) [LL-012]
- [ ] An fs-walk that classifies entries (file vs dir) resolves symlinks via explicit
      `stat`/`lstat`, NEVER via dirent type bits — on modern Node a symlink dirent reports
      `isFile()===false && isDirectory()===false`, so a two-predicate filter double-emits or
      drops it. Confirm no dirent can match both/neither classification branch. [S4 `walkLayerTree`]

## 8. Frontend type-only imports [recurrence S4+S5a]
- [ ] React types are imported by name as type-only — `import type { KeyboardEvent, ReactNode }
      from "react"` — NEVER via the `React.X` namespace (`React.KeyboardEvent`, `React.ReactNode`).
      Grep changed `.tsx`/`.ts` for `React\.[A-Z]` in type position; flag as MINOR.
