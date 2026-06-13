# Glossary — kuraka-control

Seeded by `arki` from `requirements.md` §Initial domain vocabulary. Extend as
new domain terms appear in stories and retros.

| Term | Definition |
|------|------------|
| **Vault** | The Obsidian directory at `KURAKA_VAULT` (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`); source of truth for the framework (registry, agents, triage, budgets). |
| **Control plane** | Govern: the vault + this app. |
| **Data plane** | Develop: inside each consumer project where agents run and write code. |
| **Hub-and-spoke** | Develop in projects, govern from the vault. |
| **Framework agent** | Agent owned by the vault (`agents/*.md`); **gold**; editable only here. |
| **Project layer** | A project's `.claude/project/` overrides; **jade**; project-native. |
| **Drift** | Difference between a project's mounted Kuraka version and the vault's current version. |
| **Mount** | Applying the vault framework into a project (`mount-kuraka.sh`), vault→project, read-only copies. |
| **Triage** | Routing a RETRO finding framework-vs-project and applying the patch to the correct target. |
| **Finding / pattern** | An issue surfaced by `pattern-detector` into `RECURRING-ISSUES.md`. |
| **Verification join** | The reconciliation where a new detector run closes (`Verificado`) or reopens (`Regresado`) pending triage cards (RL-1). |
| **Quipu en vivo** | The live agent-state hero on the Monitor screen (watcher, S8). |
| **Two-color governance** | Gold = framework (vault-only edit); jade = project-native (per-project edit). |
| **Write firewall** | The single backend module allowed to write; enforces the C2/C4/C6 allowlist. |
| **k/N fan-out** | Framework patch mounted to k of N projects per their state (`ParcialmenteSincronizado`, RL-3). |
| **Finding identity / signature key** | Stable key (normalized target-symbol-class + symptom-class) for dedup + recurrence (RL-7). |
| **Catalog count (16) vs budgeted (13)** | 16 = `agents/*.md` files; 13 = `BUDGETS` dict; the 3 unbudgeted are bootstrap agents amauta, arki, inti. |
| **Contracts package** | `packages/contracts` — zod schemas shared by backend (validation) and frontend (types). |
