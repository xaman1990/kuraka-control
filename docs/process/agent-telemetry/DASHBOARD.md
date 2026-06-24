# Kuraka Telemetry Dashboard

_Updated: 2026-06-24 (hand-rolled after S4; per-cycle JSON is gitignored)_
_Cycles analyzed: 5_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total tool uses | Total duration |
|-------|------|-----:|-------------:|----------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 107 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | 270 | ~46.5min wall |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~235 | ~28min wall |
| REQ-20260622-S3-project-config-tab | reduced (T3 combined 1+2) | 6 | 390,373 | ~180 | ~33min wall |
| REQ-20260624-S4-project-layer-browser | normal full + 5.5 Security | 10 | 688,437 | ~266 | ~58min wall |

**Token trend: S1 463K → S2 450K → S3 390K → S4 688K.** S4 is the first cycle UP — **scope, not
regression**: complexity L + a dedicated 5.5 security subagent + a real BLOCKER fix loop (10 runs vs 6).
Per-run tokens stayed in-band.

## Per-agent aggregate (S12 + S1 + S2 + S3 + S4)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 10 | 437,913 |
| code-reviewer | 5 | 355,364 |
| final-auditor | 4 | 332,641 |
| backend-developer | 6 | 286,398 |
| po-analyst | 6 | 283,664 |
| test-engineer | 4 | 280,892 |
| architect-reviewer | 4 | 242,687 |
| story-refiner | 3 | 156,189 |
| security-reviewer | 1 | 62,862 |

## Totals

- Total tokens (5 cycles): **2,139,114**
- Cycles: **5**
- Avg tokens per cycle: **427,823**

## Notes

- **S4 — first dedicated Phase 5.5 Security** (un-folded by Rule 0 for the client-path file-read surface):
  PASS, no CRITICAL — every adversarial vector traced + live-confirmed. Clean division of labor: 5.5
  passed the containment seam, the 6D review caught a non-security correctness BLOCKER (symlink
  double-classification, Node-22 dirent footgun → **LL-012**).
- **Lessons compounding**: LL-008→S2 enum; LL-010→S3 single-pass GATE0; LL-011→S4 exact containment;
  LL-012 added (fs-walk symlink classification via stat, not dirent bits) + paired review-check §7.
- **`pattern-detector` is now DUE** (5 RETROs: S12,S1,S2,S3,S4). Run before the next `/kuraka`. Threads:
  code-reviewer latency (3/5 cycles), the LL-011/LL-012 mechanism-hedge split, arki gaps stay-closed,
  and the carried debts below.
- Carried follow-ups (5 cycles): canonical vault `VERSION` file; sidebar active-nav prefix-match; T1
  context-digest for code-reviewer (latency); dev-README `BACKEND_PORT` note.

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
