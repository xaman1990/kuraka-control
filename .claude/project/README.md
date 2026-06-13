# `.claude/project/` — project specialization layer (kuraka-control)

This is the **jade** (project-native) layer for kuraka-control. The Kuraka
framework agents (gold, in the vault `agents/*.md`) read these files at
invocation time to specialize their behavior for this project. Seeded by `arki`.

## Layout
| Dir / file | Purpose | Filled by |
|------------|---------|-----------|
| `glossary.md` | Domain vocabulary | seeded by arki; grow as terms appear |
| `conventions/` | Stack/domain rules agents enforce | seeded; team adds over time |
| `review-checks/` | Per-agent review checklists | seeded; grows from retros |
| `agents/` | `*.append.md` overrides appended to framework agents | empty; add per need |
| `lessons-learned/` | `LL-NNN` incident lessons + `INDEX.md` | empty index; grows per retro |

## How the team maintains it
- Conventions and review-checks accumulate as patterns surface in RETRO →
  RECURRING-ISSUES → triage (routed **project**, the jade path).
- Framework-routed findings (gold) are NOT applied here — they go to the vault
  `agents/*.md` through this app's own triage flow (dogfood).
- Agent overrides go in `agents/<agent>.append.md` (the mount-respected path;
  cf. the sie_v2 triage that learned `.claude/agents/*.append.md` was excluded).
