# SMOKE-S5a — RETRO Triage board + card detail (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-25 against the real
> Kuraka vault triage store. READ-ONLY (write actions = S5b).

## End-to-end flow (one sentence)
The system can now **see the improvement-loop triage state**: a board of triage
findings parsed from the vault `retro-triage/*.md` store, each routed framework/project,
with a card-detail view of the full triage doc + rationale.

## Environment
- `BACKEND_PORT=5184 npm run dev` (backend 5184 to avoid an unrelated project's Vite on :5174). Frontend :5173.
- Real store: `<vault>/retro-triage/2026-06-06-sie_v2.md` (6 findings) + `_TEMPLATE.md` (excluded).

## Scenario 1 — API (backend, real data)
`GET /api/triage` → `200`, `empty:false`, 1 doc (`2026-06-06-sie_v2`, `decision:applied`, 6 findings). `_TEMPLATE.md` excluded. Parser correct: `**framework**` bold stripped (P2 routing=`framework`), backtick targets stripped, P1 routing=`project`.

## Scenario 2 — Board (browser)
**Action:** navigate `http://localhost:5173/triage`.
**Verified (`s5a-triage-board.png`):**
- AppShell sidebar, "RETRO Triage" active (MEJORAR group). Header "RETRO Triage · Vault · retro-triage · 6 findings".
- Responsive grid of 6 TriageCards (one per finding), each: context (project · date), finding title, **two-color routing badge** (P2 `● framework` GOLD; the 5 others `● project` JADE — governance convention working), severity badge (HIGH/MED), target_file (muted monospace).
- 0 console errors.

## Scenario 3 — Card detail (browser, from cache)
**Action:** click the first card → `/triage/2026-06-06-sie_v2` (reads from the `["triage"]` query cache, no new fetch).
**Verified (`s5a-triage-detail.png`):** breadcrumb; doc header (sie_v2 · date · source `RECURRING-ISSUES (7 RETROs…)` · `applied` decision · tags); **Findings (6) table** (#, finding, routing badge, target, severity, status); **Decisions & rationale** prose section. 0 console errors.

## Components exercised
Vite proxy → `GET /api/triage` → service → repository `triageReader` (lists `retro-triage/*.md`, excludes `_*`, per-doc degrade) → pure `parseTriageFindings` (frozen table algorithm: header-find, separator-skip-if-separator, bold/backtick strip, positional map, degrade) + rationale extractor → zod `TriageListResponse` → react-query → TriagePage board (flatten findings → TriageCard, two-color routing) → TriageDetailPage (from cache).

## Not exercised in-browser (justified — covered by tests)
- Empty store / malformed doc degrade / `_TEMPLATE` exclusion / escaped-pipe no-throw / missing-dir 500 → `triage.test.ts` (48) + `triageReader.test.ts` (17) + integration (13). Live store is non-empty + well-formed.

## Follow-ups surfaced (non-blocking)
- **Date formatting** (NEW, MINOR): the card/detail render the `date` via `Date` → verbose `Fri Jun 05 2026 19:00:00 GMT-0500 (...)` and a TZ off-by-one (`2026-06-06` → shown Jun 05). Format as a plain `YYYY-MM-DD` string (the source is already that). Carry to S5b or a polish pass.
- **S5b (write half)**: route/apply/defer actions + the corrected state machine (PendienteVerificación → Verificado/Regresado + exceptions) + dedicated Phase 5.5 (vault writes).
- (carried) canonical vault `VERSION` file; sidebar active-nav prefix-match; dev-README note (now applied).

**Verdict: GREEN — triage board + detail work end-to-end on real vault data; two-color routing governance visible; read-only as scoped.**
