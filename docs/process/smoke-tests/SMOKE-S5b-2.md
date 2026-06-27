# SMOKE-S5b-2 — apply + confirm-token modal (RL-4) (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-26 against a
> DISPOSABLE TEMP vault copy — the real vault was NEVER written.

## End-to-end flow (one sentence)
The system can now **apply a triage finding**: project-routed = one-click; framework-routed
goes through the **RL-4 human-in-the-loop confirm modal** (HMAC token) before the
`Aplicado` transition is written to the triage card.

## Environment (write-safe)
- Throwaway backend (:5190) + frontend (:5180) on a TEMP vault copy of `retro-triage/` + `projects/`. Torn down + temp deleted after. Real vault never targeted.

## Scenario — framework apply confirm round-trip (browser, the golden path)
**Action:** navigate `/triage/2026-06-06-sie_v2`; the findings table Actions column now has, per row, the routing select + Defer/Reject (S5b-1) + **Apply** (S5b-2). Clicked **P2's Apply** (P2 is `framework`-routed, target `rules/17-...md`).
**Verified (`s5b2-confirm-modal.png`):**
- The first Apply POST returned **403 CONFIRM_REQUIRED** → the **`ConfirmApplyModal`** opened (role="dialog", focus-on-mount):
  - title "Confirm framework apply"; **TARGET FILE (gold framework)** `rules/17-kuraka-token-optimizations.md (Rule T6)`;
  - a **blast-radius `note`**: "This authorizes a change to a shared framework file. The change affects all projects that use this vault…";
  - the **confirmation-token expiry time** ("expires at 9:30:07 p.m. …");
  - Cancel / Confirm Apply.
- Clicked **Confirm Apply** → re-POST with the HMAC token → **200**; modal closed; `["triage"]` invalidated.
- On disk (TEMP card): P2 `status = applied`; **`date: 2026-06-06` preserved** (LL-013, no `matter.stringify`).
- **REAL vault P2 untouched.**
- Project apply (P1, P3–P6) renders a one-click Apply (no modal) — no token needed (RL-6 backup-only).
- Console: the initial 403 logs as a console error (expected — it drives the modal); no app crash.

## Components exercised
Vite proxy → `POST /api/triage/:id/apply` → route → `applyTriage` (guards → RL-5 scan re-read → framework branch → `verifyConfirmToken` [HMAC, length-guarded timingSafeEqual, scope, TTL, used-Map] → CONFIRM_REQUIRED mint / on valid token → `setFindingCell(...,5,"applied")` via WriteFirewall → markTokenUsed) → re-read `TriageDoc` → react-query mutation → `FindingApplyControl` + `ConfirmApplyModal`.

## Not exercised in-browser (justified — covered by tests + security review)
- Token forge/replay/scope/expiry, RL-5 409 two-card conflict, idempotent already-applied, short-row→404, null guards → `confirmToken.test.ts` + `triageActions.test.ts` + `triage.route.test.ts` (628 tests) + the Phase-5.5 security review (19 unit + 15 HTTP adversarial probes, all live-confirmed). Real-vault isolation also proven there.

## Scope boundary (next story, NOT here)
- **transition-only**: the apply writes only the `Aplicado` state to the triage card; the actual gold `agents/*.md` **content** patch is deferred to a later story (the firewall `framework_patch` entry is declared but inert). Mount-to-ALL fan-out is S7/S10 area.

## Follow-ups (carried)
- Date still renders verbose (S5a convention — render `YYYY-MM-DD` verbatim). Canonical vault `VERSION` file; sidebar active-nav prefix-match.
- **Process: `make test` does not typecheck** — an S4 `as string` typecheck error survived several cycles until the S5b-2 review caught it. Add typecheck to the test gate (or a `make check`). [for RETRO]

**Verdict: GREEN — framework apply RL-4 confirm modal works end-to-end through the UI; surgical + date-preserving; the REAL vault was never touched; security review PASS (no CRITICAL).**
