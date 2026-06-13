# Arquitectura — kuraka-control

Authored by `arki` during Greenfield Bootstrap, after `inti` discovery.
The stack is **locked by constraint C1**; these documents fill the *open*
decisions arki owns and record the forks for the user to confirm.

## Index

| Doc | What it decides |
|-----|-----------------|
| `stack-decision.md` | Master ADR: language (TS), layout (npm workspaces), lib choices, test runners, dev topology. Cites C1–C6. |
| `adr-001-language-typescript.md` | TS over JS, both sides. |
| `adr-002-layout-workspaces.md` | npm-workspaces monorepo + shared `contracts` package. |
| `adr-003-live-fs-read.md` | How the backend reads the vault + each project live, read-only. |
| `adr-004-live-state-watcher.md` | "Quipu en vivo" transport — RECOMMENDED approach + **spike** (open question #1). |
| `adr-005-script-subprocess-boundary.md` | Invoking vault scripts as subprocesses; parsing stdout/exit code (C5). |
| `adr-006-write-firewall.md` | Direct-write firewall: only `retro-triage/*.md` + patch targets (C2/C4/C6). |
| `adr-007-two-color-governance.md` | Gold (framework) vs jade (project-native) enforcement (C6). |
| `layers.md` | Backend + frontend layer patterns. |
| `domain-model.md` | Core entities + the RETRO state machine (RL-1…RL-7). |
| `integrations-overview.md` | Every external touch point (vault fs, project fs, vault scripts). |
| `security-model.md` | Trust boundary, write firewall, subprocess hardening. |
| `deployment.md` | localhost dev/run topology (Vite proxy → Express). |

## Conventions for these ADRs
Each ADR ≤ 200 LOC, status one of `accepted | proposed | spike`.
Forks the discovery docs did not resolve are recorded as `proposed` and
flagged in arki's bootstrap report.
