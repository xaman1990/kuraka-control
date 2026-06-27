# Kuraka Telemetry Dashboard

_Updated: 2026-06-27 (hand-rolled after S5b-2; per-cycle JSON is gitignored)_
_Cycles analyzed: 8_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total duration |
|-------|------|-----:|-------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | ~46.5min |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~28min |
| REQ-20260622-S3-project-config-tab | reduced (T3 combined 1+2) | 6 | 390,373 | ~33min |
| REQ-20260624-S4-project-layer-browser | normal full + 5.5 Security | 10 | 688,437 | ~58min |
| REQ-20260624-S5a-retro-triage-board | reduced (T3, read-only; S5 split) | 6 | 430,985 | ~30min |
| REQ-20260625-S5b-1-triage-write-actions | normal full + 5.5 (first vault WRITE) | 10 | 803,664 | ~40min |
| REQ-20260625-S5b-2-apply-confirm-conflict | normal full + 5.5 (HMAC confirm gate) | 8* | 852,159 | ~50min |

\* S5b-2 total excludes the Phase-6 test-engineer run (token count lost to a mid-run session reset; suite verified green).

**Token trend (real-feature cycles): S1 463 → S2 450 → S3 390 → S4 688 → S5a 431 → S5b-1 804 → S5b-2 852K.**
The three spikes (S4, S5b-1, S5b-2) are scope-driven — L complexity / first-write / highest-trust HMAC gate,
each with a dedicated 5.5 + fix loops. Reduced/read-only cycles (S3, S5a) stay in the low band.

## Per-agent aggregate (8 cycles; S5b-2 test-engineer tokens not captured)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 16 | 762,935 |
| backend-developer | 11 | 746,273 |
| final-auditor | 7 | 636,605 |
| code-reviewer | 8 | 625,960 |
| po-analyst | 9 | 518,004 |
| test-engineer | 7 | ~505,247+ |
| architect-reviewer | 7 | 493,527 |
| story-refiner | 5 | 277,347 |
| security-reviewer | 3 | 230,447 |

## Totals

- Total tokens (8 cycles): **~4,225,922**
- Cycles: **8**
- Avg tokens per cycle: **~528,240**

## Notes

- **Adversarial freeze = 3 consecutive PRE-CODE major catches**: S4 (Windows-drive `isAbsolute` bypass),
  S5b-1 (`matter.stringify` date corruption), S5b-2 (4 nullable-contract-field holes — null-target scope
  collapse, RL-5 null-id self-exclude, timingSafeEqual length-guard, used-Set→Map TTL prune). Zero rework.
- **First vault-WRITE path shipped clean across S5b-1/S5b-2**: WriteFirewall (single writer, atomic, byte-
  preserving), HMAC confirm-token (RL-4) for framework apply, RL-5 conflict, RL-6 no-mount. 3 dedicated 5.5
  security reviews (S4, S5b-1, S5b-2) all PASS, no CRITICAL — every vector live-verified vs temp vaults; the
  real vault was never written in dev/test.
- **Two process findings (S5b-2)**: (1) orchestrator temp-vault live-verify caught a runtime apply bug
  (no-op→404) that green `make test` structurally couldn't (apply tests are Phase 6); (2) `make test` ≠
  typecheck — an S4 `as string` error rode green ~3 cycles → **LL-014 + `make check` (lint+typecheck+test)**
  now the Phase-4 green gate (it immediately caught a stray unused const on first use).
- **Lessons**: LL-007..014 + review-checks §6–§9. Mechanism-hedge family is now 3-form (LL-011 obvious /
  LL-012 platform / LL-013 library). `RetroState` z.enum is the LL-008 app-owned exception.
- **pattern-detector OVERDUE** (8 RETROs; 3 since the S4 pass). Run before the next story. New threads:
  adversarial-freeze pattern ×3, nullable-contract-field root cause (S5b-1/S5b-2), function-size recurrence.
- **Next**: pattern-detector Pass 2 → gold-content-apply story (flip the inert firewall `framework_patch`
  to an active token-enforced write) → S7 ACT runner (owns mount-to-ALL; must honor S5b-2's RL-6 no-mount).
- Carried follow-ups: canonical vault `VERSION` file; sidebar active-nav prefix-match; date render polish (S5a).

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
