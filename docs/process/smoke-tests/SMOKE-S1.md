# SMOKE-S1 — Registry reader + /projects page (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-21 against the
> real Kuraka vault (`KURAKA_VAULT` default), not synthetic fixtures.

## End-to-end flow (one sentence)
The system can now **list every registered project from the live vault registry at
`/projects` and route into a per-project detail shell** when the user opens the
dashboard.

## Environment
- `BACKEND_PORT=5184 FRONTEND_PORT=5173 npm run dev` (backend port moved to 5184 to
  avoid a collision with an unrelated project's Vite on `localhost:5174`; both the
  Express port and the Vite `/api` proxy read `BACKEND_PORT`, so no source change).
- Vault: real registry at `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/projects/*.md` (8 files).

## Scenario 1 — API (backend, real vault)
**Command:** `curl -s http://localhost:5184/api/projects`
**Result:** `200`, `ProjectListResponse` with 8 projects. Verified the frozen contract on live data:
- `status` returned as a plain string incl. `active`, `onboarding`, **`mapped`** (the value that would have thrown under the old enum — the GATE0 decision validated at runtime).
- `governance: "project"` derived server-side on every entry.
- empty strings normalized to `null` (`repo_url`, `last_mount`, `focus_scope` where blank).
- `kuraka_version` coerced to string `"0.3.4"`.

## Scenario 2 — Projects list (browser)
**Action:** navigate `http://localhost:5173/projects` (viewport 1440×900).
**Verified (screenshot `s1-projects-page.png`):**
- Sidebar (248px) with brand + grouped nav (OBSERVAR / DESARROLLAR / MEJORAR / SISTEMA); **Proyectos** active (accent left border). Routeless items inert.
- Header "Proyectos" + "Vault registry · 8 projects".
- Responsive grid of 8 `ProjectCard`s; each shows name, `● project` governance badge (jade), stack, status badge, `v0.3.4` (mono, dimmed).
- Status badge colors per `KNOWN_STATUS_VARIANT`: `active`→jade, `onboarding`→accent, `mapped`→accent. No crash on `mapped`.
- Console: 1 error = `favicon.ico 404` (cosmetic, no favicon asset). No app errors.
- Close visual match to the Pencil `Monitor / Resumen` ProjectsSection + `ProjectCard` frames.

## Scenario 3 — Detail shell (browser, deep-link / cache-miss path)
**Action:** navigate directly `http://localhost:5173/projects/sie_v2` (cold cache → exercises refetch-then-lookup).
**Verified (screenshot `s1-detail-shell.png`):** renders `sie_v2`, `● project` badge, stack, `active` status, `v0.3.4`, and placeholder "Detail content arriving in S2–S4." 0 console errors.

## Components exercised
Vite proxy → Express `/api/projects` route → service → repository (real fs walk of vault `projects/*.md`) → gray-matter parse → domain normalizer → zod contract → react-query → ProjectsPage states → ProjectCard → Link → ProjectDetailShell (cache + refetch lookup).

## Not exercised (justified)
- 500 `VAULT_UNREADABLE` path — covered by integration test `backend/tests/projects.test.ts` (real temp dir), not re-run in browser.
- Empty state (`empty:true`) — covered by integration + repository tests; the real vault is non-empty so not reproducible in this run.
- Per-file malformed-frontmatter degradation — covered by repository tests; all 8 live files are well-formed.

## Follow-ups surfaced (non-blocking, for RETRO)
1. `backend/src/index.ts` does not export the Express app → integration test rebuilds an equivalent app inline. Add a `createApp()` factory for true app-level tests.
2. `backend/` has no `eslint.config` (pre-existing arki scaffold gap) → `make lint` fails on the backend workspace. Add config in a follow-up.
3. Detail shell has no shared sidebar/layout (different chrome than `/projects`) → S2 should extract a shared layout (code-review SUGGESTION 9).

**Verdict: GREEN — golden path works end-to-end on real vault data.**
