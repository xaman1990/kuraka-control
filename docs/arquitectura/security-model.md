# Security model — kuraka-control

Single local operator (Carlos), localhost only, **no auth** by design (NFR).
The threat model is therefore not external attackers but **accidental damage to
the source of truth**: the vault and consumer projects.

## Trust boundary
- The backend runs as the operator's user and has the operator's fs permissions.
  It can read/write anywhere the user can — so the *discipline* is in code, not
  in OS permissions.
- The SPA is untrusted input to the backend (even single-user): every request is
  **zod-validated** at the route boundary (`packages/contracts`).

## Controls (all map to constraints)

| Control | Mechanism | Constraint |
|---------|-----------|------------|
| **Write firewall** | only `WriteFirewall` calls `fs.writeFile`; allowlist of write classes; path-traversal denial | C2/C4/C6 (adr-006) |
| **Read-only consumers** | `ProjectRepository` never writes; firewall denies any consumer `backend/`/`frontend/` path | C4 |
| **Framework write gate** | `agents/*.md` writes require an explicit human-confirm token | C6/RL-4 |
| **No deprecated sync** | no code path invokes `sync-obsidian.sh`; firewall denies it | C3 |
| **Subprocess hardening** | `spawn` with arg arrays (no shell string interpolation); per-action timeout; cancellable | C5 (adr-005) |
| **Path containment** | a resolver pins every fs access to {vault root} ∪ {registered project roots}; symlink/`..` escape → throw | C2/C4 |
| **No silent failure** | every script run surfaces exit code + stdout/stderr; every read error returns a typed error the UI shows | NFR |
| **Conflict serialization** | apply blocked when a sibling triage card targets the same file; re-validate at apply | RL-5 |

## Data classification
All data is local markdown/JSON; no secrets, no PII transit, no cloud. `.env`
holds only `KURAKA_VAULT` and ports — no credentials. `.env` is gitignored.

## Key management
None required (no auth, no external services).
