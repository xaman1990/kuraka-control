# Kuraka Telemetry Dashboard

_Updated: 2026-06-24 (hand-rolled after S3; per-cycle JSON is gitignored)_
_Cycles analyzed: 4_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total tool uses | Total duration |
|-------|------|-----:|-------------:|----------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 107 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | 270 | ~46.5min wall |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~235 | ~28min wall |
| REQ-20260622-S3-project-config-tab | reduced (T3 combined 1+2) | 6 | 390,373 | ~180 | ~33min wall |

**Token trend (real feature cycles): S1 463K → S2 450K → S3 390K** — monotonically down as the
pattern library + lessons compound (S3 reused S2's reader/compose pattern; T3 combined 1+2 saved ~22–45K).

## Per-agent aggregate (S12 + S1 + S2 + S3)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 8 | 317,659 |
| code-reviewer | 4 | 267,014 |
| final-auditor | 3 | 230,283 |
| po-analyst | 5 | 228,711 |
| test-engineer | 3 | 190,864 |
| backend-developer | 4 | 179,095 |
| architect-reviewer | 3 | 167,853 |
| story-refiner | 2 | 99,481 |

## Totals

- Total tokens (4 cycles): **1,450,677**
- Cycles: **4**
- Avg tokens per cycle: **362,669**

## Notes

- **3 consecutive clean cycles (S1→S2→S3)**: each later cycle had fewer/no rework loops. S3
  was the first to use T3 (combined Phase 1+2) and the first to reuse the prior cycle's
  implementation pattern (`readProjectConfig` ≅ `readLockVersion`; `config` composed like `drift`).
- **Lessons compounding**: LL-008 drove S2's `DriftState` enum; LL-010 (proactive GATE0) gave S3
  a single-pass GATE0; LL-011 (state the exact parse/compare/curate mechanism in the story) added
  after S2+S3 both spent an architect MINOR on a hedged mechanism.
- **pattern-detector**: recommend running **after S4** (5th RETRO, normal cadence) — confirm the
  mechanism-hedge thread + code-reviewer latency, and give LL-011 one cycle to prove itself.
- Carried follow-ups (project-layer/doc, non-blocking): canonical vault `VERSION` file; sidebar
  active-nav prefix-match; T1 context-digest for code-reviewer (latency); dev-README `BACKEND_PORT` note.

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
