# REQ-20260625-S5b: RETRO Triage write actions + WriteFirewall + state machine

> First vault-WRITE surface for kuraka-control. Highest-risk story to date.
> The authoritative design ALREADY EXISTS (adr-006, domain-model, security-model,
> adr-007, fs-and-vault-safety). This REQ scopes that design, resolves the open
> mechanism decisions, and recommends a sub-split. It does NOT reinvent the design.

## Workflow Status
- [x] Phase 1: PO Analysis — IN PROGRESS
- [ ] Phase 2: Story Refinement
- [ ] Phase 2.5: Test Planning — FOLDED into Phase 2 (refiner emits the AC + test matrix together for this cut; T-rules)
- [ ] Phase 3: Architect Review (schema freeze — re-runs GATE0 grep + WriteFirewall allowlist audit)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] **Phase 5.5: Security Review — DEDICATED & MANDATORY** (first write surface; SCHEMA-FROZEN-S5a §7 explicitly requires it)
- [ ] Phase 6: Tests (incl. Phase 6.8 runtime smoke against a TEMP vault copy — never the real `<vault>/retro-triage/`)
- [ ] Phase 6.5: E2E — DEFERRED (UI action wiring covered by Phase 6 integration + 6.8 smoke; promote to E2E only if S5b ships its own multi-step UI confirm flow)
- [ ] Phase 6.7: Deployment Verification — SKIPPED (local single-user, no Docker/CI surface for this cut)
- [ ] Phase 7: Final Audit

**Pipeline rationale:** this is a write + state-machine + security-critical cut, so
the full pipeline runs with a **dedicated 5.5** (not folded as S5a's read-only cut
allowed). 2.5 is folded into 2 (the refiner is competent to co-emit the test matrix
for this scope and it avoids a context re-read). 6.5 deferred / 6.7 skipped per the
local single-user, no-CI posture.

## 1. Requirement Summary
S5b is the **write half** of S5: governed actions on RETRO triage cards — **route**
(set routing framework|project), **apply**, **defer**, **reject** — that WRITE to
`<vault>/retro-triage/*.md`, plus the human-driven transitions of the corrected RETRO
state machine (domain-model RL-1..RL-7, the S5b subset). It builds on S5a's read board
(`/triage`, `GET /api/triage`, the FROZEN `TriageDoc`/`TriageFinding` contract) and
introduces the **`WriteFirewall`** — the single, audited module allowed to call
`fs.write*`. The auto-verification join (K=2 close, RL-1/RL-2) and dedup (RL-7) are
**S10**, OUT of scope here.

## 2. Scope

### Sub-split recommendation (REQUIRED) — **SPLIT into S5b-1 + S5b-2**

**Recommendation: do NOT implement S5b as one story. Split it.** The first-write-
surface + the firewall alone is a meaty, security-critical slice; bundling
framework-apply (the highest-blast-radius action, RL-4 confirm token + RL-5 conflict
serialization) into the same cut would make Phase 5.5 review one giant attack surface
and violate the spirit of Rule T6 (don't batch interdependent, security-relevant
features). Justification on risk/size:

| Cut | Surface | Blast radius | Risk class | Est. size |
|-----|---------|--------------|------------|-----------|
| **S5b-1** — WriteFirewall foundation + low-blast-radius actions | `WriteFirewall` (allowlist, path-containment, refusals, `_TEMPLATE.md` seed) + **route**, **defer**, **reject** — all `triage_record` writes only; NO `framework_patch`, NO mount, NO apply-time conflict check needed (these actions only mutate the triage card itself) | Writes ONLY to `<vault>/retro-triage/*.md` — the app's own store, fully reversible | HIGH (first write surface, but contained to the app's own store) | L |
| **S5b-2** — apply + framework apply (RL-4) + conflict serialization (RL-5) | **apply** (project one-click → `Aplicado`) + **framework apply** (human-confirm token RL-4) + **RL-5 conflict serialization** (block apply if a sibling card targets the same file; re-read+re-validate at apply) + RL-6 (project-routed = backup-only, never mounts) | apply touches the patch TARGET semantics; framework apply is the gold/`agents/*.md` path (highest blast radius). NOTE: in S5b-2 the *write* of the patch target file (`agents/*.md` / project layer) may itself be deferred — see §3 scope note — but the state transition + confirm-token gate + conflict check land here | CRITICAL (gold write path, confirm token, conflict) | M–L |

**Why this boundary is the right cut:** S5b-1 proves the firewall end-to-end against
the *lowest-stakes* writes (the card's own frontmatter/table), so the audited
single-writer invariant is established and reviewed before any gold (`agents/*.md`)
write is wired. S5b-2 then adds only the confirm-token gate, the conflict-
serialization re-validate, and the apply transition on top of a proven firewall. Each
cut gets its own Phase 5.5. **Both cuts share the same FROZEN contract** (this REQ's
§ contract additions), so the schema is frozen once at Phase 3 and S5b-2 is additive.

> The orchestrator should confirm this split with the user before Phase 2. If the
> user prefers one story, run S5b whole — but keep the two Phase-5.5 review passes.

### In Scope (S5b as a whole, across both cuts)
- **`WriteFirewall`** as the single `fs.write*`/`mkdir`/`rm` code path (fs-and-vault-safety §1; the ONLY new writer module).
- The write **allowlist** (write classes) + **path-containment** resolver for writes (filename regex + containment to the vault subdir), and the explicit **refusals** (out-of-allowlist path, traversal, `framework_patch` without confirm token, any consumer `backend/`/`frontend/` path, any `sync-obsidian` path).
- **Action API** endpoints for route / apply / defer / reject (request + response shapes, confirm-token field, error envelope).
- The **app-owned RETRO state machine** as a typed `z.enum` / discriminated union in `packages/contracts` (LL-008 exception — confirmed app-owned, see §GATE0 #2; precedent: `DriftState` z.enum already in contracts).
- The **write mechanism**: how route/apply/defer/reject mutate the card — frontmatter (`decision`, `applied`) and/or the findings-table `Routing`/`Status` cells (decision resolved in §4, LL-011).
- **Re-read after write**: every action's success response is the freshly re-parsed `TriageDoc` (single source of truth = disk, never an in-memory echo; fs-and-vault-safety §6).
- The S5b subset of RL rules: **RL-4** (framework apply confirm token), **RL-5** (conflict serialization), **RL-6** (project-routed = backup-only, never mounts).
- Empty / error / safety states (403 missing confirm token / out-of-allowlist, 409 conflict, `ApplyFailed` on write failure, 404 card not found).
- **`_TEMPLATE.md` seeding**: creating a NEW triage card seeds from `<vault>/retro-triage/_TEMPLATE.md` (adr-006 Consequences).
- Phase 6.8 runtime smoke that runs against a **TEMP vault copy** (safety constraint, §6).
- Frontend action wiring on the existing `/triage` board / detail (buttons → endpoints, confirm-token modal for framework apply, optimistic-off / re-read on success). *(May be its own frontend story behind the frozen contract — refiner decides; backend + frontend can parallelize per `parallel_implementation: true`.)*

### Out of Scope
- **Auto-verification join (RL-1 / RL-2, K=2 close `PendienteVerificación` → `Verificado`)** — S10.
- **Dedup / finding-identity signature key (RL-7)** and `Supersedido` — S10.
- **`pattern-detector` agent behavior change** (read triage store, emit signature keys, reconcile pending cards) — domain-model Open Question #3, deferred to S10. This REQ does not touch any framework agent prompt.
- **`framework_patch` mount-to-ALL fan-out (RL-3 / `ParcialmenteSincronizado` k/N)** — that is the mount surface (S3/S7 area), not S5b. S5b implements RL-6 (project-routed = backup-only, never mounts) by simply **not** triggering a mount.
- **The actual content-patch of a framework agent file (`agents/*.md`) or a project-layer file** as a diff/patch application — see §3 scope note. S5b-2 wires the *state transition* + confirm-token gate + conflict check; whether it also performs the target-file write or records `Aplicado` for an externally-applied patch is a refiner/architect decision flagged below (LL-011 candidate to resolve at freeze).
- **Telemetry / budgets / live watcher** — other stories.
- **Auth** — none by design (single local operator; security-model).
- Pipes-in-cells table upgrade (escaped `\|`) — SCHEMA-FROZEN-S5a §3 known limitation; only required if a future card needs it.

## 3. Table Inventory

**N/A — no database.** `orm: none` in `kuraka.config.yaml`; the vault filesystem IS
the store (C2). The persistent state S5b owns lives in `<vault>/retro-triage/*.md`
(triage cards), which are markdown files, not DB tables. No table is CREATEd, ALTERed,
or referenced. (For completeness against the schema: zero tables, all justified by the
no-DB architecture; nothing extra-to-Jira.)

## 4. Affected Endpoints

Mounted under `/api` in `backend/src/index.ts` (extend `createTriageRouter`).
Auth column omitted — single local operator, no auth (security-model).

| Method | Path | Action | Cut | Body (request) | Success | Errors |
|--------|------|--------|-----|----------------|---------|--------|
| POST | `/api/triage/:id/route` | Set routing on a finding / card → `Enrutado(marco\|proyecto)` | S5b-1 | `{ finding_id?: string, routing: "framework"\|"project" }` | 200 `TriageActionResponse` (re-read `TriageDoc`) | 404 NOT_FOUND, 409 CONFLICT (RL-5 if route implies a target collision — see note), 403 PATH_FORBIDDEN, 500 VAULT_UNREADABLE / WRITE_FAILED |
| POST | `/api/triage/:id/defer` | → `Diferido` | S5b-1 | `{ finding_id?: string }` | 200 `TriageActionResponse` | 404, 403, 500 |
| POST | `/api/triage/:id/reject` | → `Rechazado` (reopenable) | S5b-1 | `{ finding_id?: string }` | 200 `TriageActionResponse` | 404, 403, 500 |
| POST | `/api/triage/:id/apply` | Project one-click apply → `Aplicado`; framework apply requires `confirm_token` (RL-4) | S5b-2 | `{ finding_id?: string, confirm_token?: string }` | 200 `TriageActionResponse` | **403 CONFIRM_REQUIRED** (framework apply, no/invalid token), **409 CONFLICT** (RL-5 sibling targets same file), 404, 403 PATH_FORBIDDEN, 500 WRITE_FAILED / VAULT_UNREADABLE |

**Endpoint-shape decision (resolve at refine, recommendation here):** prefer **four
distinct verbs** (`/route`, `/apply`, `/defer`, `/reject`) over a single
`PATCH /:id { action }` discriminant. Rationale: each verb has a different request
shape (apply alone carries `confirm_token`) and different error set (only apply
returns CONFIRM_REQUIRED/CONFLICT); distinct routes keep the zod request schema per
verb small and the route-level guards readable, matching the existing per-endpoint
style in `routes/projects.ts`. A discriminated-union `PATCH` is the fallback if the
refiner prefers one handler.

**`:id` server param now reaches logic** (unlike S5a, where detail was client-side).
`:id` is the card slug (filename minus `.md`). It MUST be validated at the route the
same way `routes/projects.ts` validates `:name` (reject blank, `/`, `\`) AND
re-validated by the WriteFirewall filename regex before any write — defense in depth.
`finding_id` is OPTIONAL: present → the action targets one findings-table row
(per-finding `Status`/`Routing`); absent → the action targets the card-level
`decision`/`applied` frontmatter. (§4 defines exactly which.)

**Scope note (target-file write vs transition-only):** for `apply` on a
`framework`/`project` routed finding, S5b-2 lands the **transition + confirm-token gate
+ RL-5 conflict check + RL-6 no-mount**. Whether the same action also writes the patch
*target* file (`agents/*.md` via `framework_patch`, or `<project>/.claude/project/**`
via `project_patch`) is a **mechanism decision the architect must freeze** (LL-011):
options are (a) S5b-2 records `Aplicado` for a patch the operator applied out-of-band
(transition-only, lowest risk), or (b) S5b-2 performs the target write through the
firewall's `framework_patch`/`project_patch` classes. The WriteFirewall MUST define
all three write classes regardless; the apply *action* may exercise only
`triage_record` in (a). Recommend **(a) transition-only for the first S5b-2 ship**,
deferring target-file content patching to a follow-up, to keep the first gold-path
review minimal — but flagged for the architect, not decided unilaterally here.

## 5. Write mechanism (KEY decision — LL-011, resolved)

GATE0 inspected the live `_TEMPLATE.md` and the live card `2026-06-06-sie_v2.md`. Both
encode state in **two places**: (a) frontmatter `decision` (pending|applied|rejected|
deferred) + `applied: bool`, and (b) a per-finding 6-column table whose col `[2]`=
`Routing` (framework|project, may be `**bold**`) and col `[5]`=`Status` (applied|
pending, may be `**bold**`).

**Resolved mechanism (S5b writes BOTH, addressed by `finding_id` presence):**

1. **Per-finding actions** (`finding_id` present) rewrite the **findings-table row** for
   that finding:
   - `route` → set col `[2]` `Routing` to `framework` | `project`.
   - `apply` → set col `[5]` `Status` to `applied`.
   - `defer` → set col `[5]` `Status` to `deferred`.
   - `reject` → set col `[5]` `Status` to `rejected`.
2. **Card-level actions** (`finding_id` absent) rewrite the **frontmatter**:
   - `apply` → `decision: applied`, `applied: true`.
   - `defer` → `decision: deferred`. `reject` → `decision: rejected`. `route` is
     finding-scoped only (a card has no single routing) → **400 BAD_REQUEST** if
     `route` is called without `finding_id`.

**HOW the write is performed (resolved, copy-ready for the freeze):**
- **Frontmatter:** re-serialize via `gray-matter` (already a dependency; S5a parses
  with it). `matter.stringify(body, updatedData)` rewrites ONLY the frontmatter block,
  preserving the body byte-for-byte. Do NOT hand-edit the `---` block with regex.
- **Findings table:** a **surgical single-cell rewrite**, NOT a full-table
  regeneration. Reuse the S5a parse anchors (`backend/src/domain/triage.ts`:
  `splitPipeLine`, `stripBold`, `isSeparatorRow`, the header-find + positional
  `[0..5]` map). Algorithm: locate the body row whose col `[0]` (`id`) matches
  `finding_id` (after the same `emptyToNull` normalization S5a uses); replace ONLY the
  target cell's text in the ORIGINAL raw line (preserve surrounding whitespace,
  preserve other cells verbatim incl. their `**bold**`/backtick decorations);
  re-emit the cell WITHOUT re-adding `**bold**` (write plain values — the S5a parser
  strips bold on read, so plain round-trips correctly). Rewrite that one line in place;
  leave every other line untouched. This makes the write **diff-minimal and
  idempotent** and avoids the SCHEMA-FROZEN-S5a §3 pipes-in-cells limitation
  (we never re-serialize cells we didn't touch).
- **Atomicity:** write to a temp file in the same dir then `rename` over the target
  (atomic on same filesystem) so a crash mid-write never leaves a truncated card.
  This temp-write is itself a firewall-governed `triage_record` write.
- **Re-read after write:** the action service re-runs the S5a reader/parser on the
  written file and returns the fresh `TriageDoc`. The response is disk truth.

**State machine ↔ write correspondence:** the typed RETRO state is the app's
projection; the on-disk encoding is the frontmatter `decision`/`applied` + the table
`Status`/`Routing`. S5b writes the on-disk cells; the typed state union is what the
contract/service reason in. (Domain-model: `SinTriar`=no decision/status; `Enrutado`=
routing set; `Aplicado`=status/decision applied; `Diferido`/`Rechazado`=exceptions.)

## 6. WriteFirewall design (the containment + allowlist mechanism — LL-011/012)

New module `backend/src/repositories/writeFirewall.ts` — the **ONLY** module in the
backend allowed to call `fs.writeFile`/`fs.rename`/`fs.mkdir`/`fs.rm`
(fs-and-vault-safety §1; review-checks/code-reviewer §1). Every other module reads or
shells out (no new spawner — S5b has no subprocess).

**Write classes (allowlist — adr-006 table, verbatim):**

| Write class | Allowed target | Guard |
|-------------|----------------|-------|
| `triage_record` | `<vaultRoot>/retro-triage/*.md` | basename matches `^\d{4}-\d{2}-\d{2}-[a-z0-9_-]+\.md$` (the `<slug>` form; excludes `_TEMPLATE.md`); resolved path contained in `retro-triage/` |
| `framework_patch` | `<vaultRoot>/agents/*.md` | **requires a valid `confirm_token`** (RL-4); resolved path contained in `agents/` |
| `project_patch` | `<project.path>/.claude/project/**` | path inside a *registered* project root (resolve against the live registry) |

**Containment mechanism (security-model "Path containment" + LL-012):**
1. Resolve the target to an absolute, real path (`fs.realpath` on the *parent dir* for
   a to-be-created file; `realpath` on the file when it exists) — defeats `..` and
   symlink escape. Mirror the S5a layer-file resolver posture (`routes/projects.ts`
   `layer/file` → PATH_FORBIDDEN on escape; detail carries only `{ rel }`, never the
   absolute path — SEC5/SEC10).
2. Assert the real path is a prefix-child of the class's allowed root (path-prefix
   check on the resolved absolute path, not on the input string).
3. Assert the basename matches the class's filename regex (`triage_record`).
4. Only then write (temp + atomic rename for `triage_record`).

**Hard denials (throw a typed error, NEVER write):**
- any path resolving outside the three allowed roots (traversal / symlink escape) → `PATH_FORBIDDEN` (403);
- any consumer `backend/` or `frontend/` path (C4) → `PATH_FORBIDDEN` (403);
- `scripts/sync-obsidian.sh` or anything under a `sync-obsidian` path (C3) → `PATH_FORBIDDEN` (403);
- a `framework_patch` without a valid confirm token (C6/RL-4) → `CONFIRM_REQUIRED` (403);
- a `triage_record` basename failing the regex (e.g. `_TEMPLATE.md`, traversal slug) → `PATH_FORBIDDEN` (403).

**Confirm-token flow (RL-4):**
- The token is the human's explicit acknowledgment of the gold-write blast radius. It
  is **app-issued, single-use, short-TTL**, scoped to `{card id, finding id, target
  file}`. Recommended flow: `apply` on a `framework`-routed finding **without** a token
  → **403 CONFIRM_REQUIRED** whose `detail` carries `{ id, finding_id, target_file,
  confirm_token }` (a freshly minted token) — NOT a write. The UI shows a confirm modal
  naming the gold target; on confirm it re-POSTs `apply` WITH the `confirm_token`. The
  firewall validates the token matches the scope before any `framework_patch` write.
  (Token store: in-memory, single-process — no DB; single local operator. Refiner to
  pin TTL + storage shape; recommend ~5 min, Map keyed by scope hash.)
- This realizes adr-006 "two-step UI flow": route+apply one-click for `project`;
  framework needs the confirm token.

**Conflict serialization (RL-5 — S5b-2):** before an `apply` writes, re-read the
target file's current content AND scan sibling triage cards (the S5a reader already
lists all docs) for another card whose findings target the **same** `target_file` in a
non-terminal state. If found → **409 CONFLICT** (`detail: { target_file, conflicting_card }`),
no write. Re-validate the patch against current target content at apply time (not at
route time) — apply is where the gold/target write would land.

**RL-6 (firewall, project-routed = backup-only):** a `project`-routed apply NEVER
triggers a mount to other projects (S5b simply has no mount call; mount is S3/S7). The
project-layer write (if performed per §3 option (b)) targets only that one registered
project root. Documented so the architect confirms no mount edge sneaks in.

## 7. Affected Services & Repositories

File paths follow `architecture.layers` (route → service → repository → domain) and
the existing S1–S5a layout. No DB / migrations (`orm: none`).

> **Stack-profile gap (flag):** `.claude/stack-profiles/` has only `python-fastapi.md`
> and `vue-pinia.md` (inherited from `sie_v2`) — NO `express.md` / `react.md` profile
> for this repo's actual stack. File-layout guidance below is derived from the live
> S1–S5a code, not from a profile. The architect should treat the existing repo layout
> as the de-facto profile.

| File | Action | Cut | Description |
|------|--------|-----|-------------|
| `packages/contracts/src/index.ts` | ALTER | S5b-1 | Add `RetroState` (z.enum, app-owned — LL-008 exception), `TriageRouting` (z.enum `framework`/`project`), the per-verb request schemas (`TriageRouteRequest`, `TriageApplyRequest`, `TriageDeferRequest`, `TriageRejectRequest`), `TriageActionResponse` (= `{ doc: TriageDoc }` re-read), and the new error codes. Additive — does NOT re-cut the FROZEN S5a `TriageDoc`/`TriageFinding`. |
| `backend/src/repositories/writeFirewall.ts` | CREATE | S5b-1 | The single writer. Allowlist, containment resolver, refusals, atomic temp+rename, `_TEMPLATE.md` seed. Throws typed errors mapped to 403/409/500. |
| `backend/src/repositories/writeFirewall.test.ts` | CREATE | S5b-1 | Unit tests: each allowlist class, every refusal (traversal, consumer path, sync-obsidian, missing token, bad slug), atomicity. Against a TEMP dir, never the real vault. |
| `backend/src/domain/triage.ts` | ALTER | S5b-1 | Add a **pure** surgical single-cell table-rewrite fn (`setFindingCell(rawText, finding_id, column, value) → newRawText`) and a frontmatter-update helper, reusing the existing `splitPipeLine`/`stripBold` anchors. Pure: no fs. |
| `backend/src/domain/triage.test.ts` | ALTER | S5b-1 | Add cases for surgical rewrite: per-finding `Status`/`Routing` change preserves other cells/decorations byte-for-byte; idempotent re-apply; short/long row; finding-not-found. |
| `backend/src/services/triageActions.ts` | CREATE | S5b-1 (route/defer/reject) → S5b-2 (apply, RL-5, confirm) | Use-case layer: load card via S5a reader → apply transition rule (state machine) → build new raw text via domain fn → call WriteFirewall → re-read → return fresh `TriageDoc`. Returns string sentinels for NOT_FOUND / BAD_REQUEST / CONFIRM_REQUIRED / CONFLICT (mirrors `projectLayer.ts` `"NOT_FOUND"`/`"FORBIDDEN"` style). |
| `backend/src/services/triageActions.test.ts` | CREATE | S5b-1/2 | Service tests incl. confirm-token gate, conflict detection, ApplyFailed path. |
| `backend/src/routes/triage.ts` | ALTER | S5b-1/2 | Add the four POST routes to `createTriageRouter`. Per-route zod request validation; `:id` guard (blank/`/`/`\`); map service sentinels → 400/403/404/409 envelopes; re-throw unexpected. Mirror `routes/projects.ts` error-envelope + constant style. |
| `backend/src/routes/triage.test.ts` | CREATE/ALTER | S5b-1/2 | Route-level: status codes + envelopes for every error; re-read response shape; injected TEMP `vaultRoot`. |
| `frontend/src/api/triage.ts` | ALTER | S5b-1/2 | Add typed action callers (POST verbs); surface CONFIRM_REQUIRED token from the 403 detail. |
| `frontend/src/routes/TriageDetailPage.tsx` (+ `TriageCard.tsx`) | ALTER | S5b-1/2 | Action buttons (route/apply/defer/reject); confirm-token modal for framework apply; re-read on success (react-query invalidate); GovernanceBadge gold/jade reflects routing (adr-007 — color must match capability). |
| `backend/src/index.ts` | NONE | — | `createTriageRouter` already mounted under `/api`; no new mount needed (routes added inside the existing router). |

## 8. State-transition table (S5b subset — what the human drives here)

App-owned typed union (`enums_for_states: true`; LL-008 exception confirmed — see
GATE0 #2). S5b implements the **human-driven** transitions; the auto-verification
join (RL-1/RL-2) and dedup (RL-7) are S10.

| From | Action (S5b) | To | RL | Write | Cut |
|------|--------------|----|----|-------|-----|
| `SinTriar` | route(framework\|project) | `Enrutado(marco\|proyecto)` | RL-4 (routing is one-click, no token) | table col `[2]` Routing | S5b-1 |
| `SinTriar` / `Enrutado` | defer | `Diferido` | — | table col `[5]` Status / fm `decision` | S5b-1 |
| `SinTriar` / `Enrutado` | reject | `Rechazado` (reopenable) | — | table col `[5]` Status / fm `decision` | S5b-1 |
| `Enrutado(proyecto)` | apply | `Aplicado` | RL-4 one-click (project), RL-5 conflict, RL-6 backup-only/no-mount | table col `[5]` Status / fm `decision`+`applied` | S5b-2 |
| `Enrutado(marco)` | apply (needs confirm_token) | `Aplicado` | RL-4 confirm token, RL-5 conflict | table col `[5]` / fm; firewall `framework_patch` gate | S5b-2 |
| `Aplicado` (write threw) | — | `ApplyFailed` | — | none (state only; surfaces error) | S5b-2 |

**Deferred to S10 (NOT in S5b):** `Aplicado → Sincronizado → PendienteVerificación →
Verificado | Regresado` (RL-1/RL-2 verification join, K=2), `Supersedido` (RL-7 dedup),
`ParcialmenteSincronizado` (RL-3 k/N fan-out), `Revertido` (rollback). S5b's terminal-
for-now states are `Aplicado`, `Diferido`, `Rechazado`, `ApplyFailed`.

## 9. Empty / error / safety states

| Condition | HTTP | Code | Notes |
|-----------|------|------|-------|
| Card slug not found / blank / contains `/`,`\` | 404 | `NOT_FOUND` | `:id` guard mirrors `routes/projects.ts` `:name`; detail `{ id }` |
| `route` called without `finding_id` | 400 | `BAD_REQUEST` | a card has no single routing |
| Invalid request body (bad routing enum, etc.) | 400 | `BAD_REQUEST` | zod request-schema validation at route |
| Framework `apply` with no/invalid confirm token | 403 | `CONFIRM_REQUIRED` | detail carries a fresh `confirm_token` + the gold target; NO write |
| RL-5 sibling card targets same file | 409 | `CONFLICT` | detail `{ target_file, conflicting_card }`; NO write |
| Path escapes allowlist / traversal / consumer path / sync-obsidian | 403 | `PATH_FORBIDDEN` | detail carries only `{ id }`/`{ rel }`, never the absolute path (SEC5/SEC10) |
| Write itself failed (disk full, perms, rename race) | 500 | `WRITE_FAILED` | service maps to `ApplyFailed` state; surfaces message; no silent failure |
| `retro-triage/` dir unreadable | 500 | `VAULT_UNREADABLE` | reuse existing `VaultUnreadableError` (do not define a new one) |
| Empty store (no cards) | n/a | — | actions operate on an existing `:id`; a nonexistent card is 404, not empty-state |

## 10. Smoke safety constraint — Phase 6.8 (MANDATORY)
The Phase 6.8 runtime smoke (and EVERY automated test that exercises a write) MUST
run against a **TEMP copy of the vault** (`cp -R` the real `retro-triage/` +
`_TEMPLATE.md` into an OS temp dir, point `vaultRoot` at it via the existing
`createTriageRouter({ vaultRoot })` injection seam). **NEVER** write to the real
`<vault>/retro-triage/`. This is the same injection seam S5a used for read tests;
S5b reuses it for write isolation. The smoke asserts: a real action POST mutates the
temp card on disk, the response is the re-read doc, and a refusal (e.g. framework
apply without token) returns 403 with no disk change. A teardown removes the temp dir.

## 11. Dependencies
- **S5a (read board)** — DONE. Reuses the FROZEN `TriageDoc`/`TriageFinding` contract, `triageReader`, `parseTriageDoc`, `splitPipeLine`/`stripBold` anchors, the `vaultRoot` injection seam, the `VaultUnreadableError`, and the `ApiError` envelope + error-code-constant style.
- **adr-006 / domain-model / security-model / adr-007 / fs-and-vault-safety** — frozen design inputs (this REQ scopes them).
- **`gray-matter`** — existing dependency; used for frontmatter round-trip on write.
- **Live registry reader (S1)** — needed by `project_patch` containment (resolve registered project roots) IF §3 option (b) is taken; not needed for transition-only.
- **Internal:** the typed `RetroState` union becomes a shared contract S10 will extend (verification join). S5b freezes the human-driven subset.

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| A write escapes the firewall (any module calling `fs.write*` directly) | High | Single-writer invariant; code-reviewer §1 BLOCKER grep `fs\.(write\|rm\|mkdir)`; Phase 5.5 audits one file |
| Path traversal / symlink escape writes outside the vault | High | `realpath`-based containment on resolved absolute path (not input string) + prefix check + filename regex; LL-012 (classify by stat, never dirent bits) |
| Gold (`agents/*.md`) write without human intent | High | RL-4 confirm token, single-use, scoped, short-TTL; framework apply is 403 CONFIRM_REQUIRED until confirmed |
| Two cards apply to the same target concurrently → lost/corrupt patch | Medium | RL-5 conflict serialization: re-read + sibling scan at apply; 409 on collision |
| Smoke / tests write to the REAL vault | High | TEMP-vault-copy mandatory (§6.8); `vaultRoot` injection seam; no test reads `process.env.KURAKA_VAULT` directly |
| Table rewrite corrupts an untouched cell (pipes/decorations) | Medium | Surgical single-cell rewrite preserving the original raw line byte-for-byte; never full-table re-serialize; idempotency test |
| Crash mid-write truncates a card | Medium | Temp-file + atomic `rename` over target on same fs |
| Bundling framework-apply into one giant review surface | Medium | Sub-split S5b-1 / S5b-2; two dedicated Phase 5.5 passes |
| `decision`/`applied` frontmatter drifts from per-finding `Status` | Low–Med | Resolved mechanism (§4): `finding_id` presence picks frontmatter vs table; refiner pins whether apply-all-findings rolls up to `decision: applied` |
| Stack-profile gap (no express/react profile) | Low | Use live S1–S5a layout as de-facto profile; flagged for architect |

## 13. Proposed Stories

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S5b-1 | WriteFirewall foundation + route/defer/reject (`triage_record` writes only) + contract additions (RetroState, request/response schemas) + surgical table-rewrite domain fn | L | S5a |
| S5b-2 | apply (project one-click → `Aplicado`) + framework apply (RL-4 confirm token) + RL-5 conflict serialization + RL-6 no-mount + ApplyFailed | M–L | S5b-1 (shared frozen contract) |
| S5b-FE | Frontend action wiring (buttons, confirm-token modal, re-read/invalidate, gold/jade governance badge) — behind the frozen contract; may parallelize with S5b-1/2 backend | M | S5b-1 contract frozen |

> Refiner/architect may merge S5b-FE into S5b-1/2 or keep separate per
> `parallel_implementation: true`. Recommend: freeze the contract at Phase 3, then run
> S5b-1 backend + S5b-FE in parallel, S5b-2 sequentially after S5b-1 (Rule T6: the
> firewall + apply are interdependent + security-relevant → no parallel backend cuts;
> `make test` after S5b-1 before starting S5b-2).

## GATE0 — resolved decisions (authoritative design read FIRST; PASS)

Read & frozen against: `adr-006-write-firewall.md`, `domain-model.md`,
`security-model.md`, `adr-007-two-color-governance.md`,
`.claude/project/conventions/fs-and-vault-safety.md`, `SCHEMA-FROZEN-S5a.md`. Live
data inspected (LL-010 proactive): `<vault>/retro-triage/_TEMPLATE.md` and
`2026-06-06-sie_v2.md` (1 card, 6 findings) + the implemented S5a code
(`triage.ts`, `triageReader.ts`, `routes/triage.ts`, `routes/projects.ts`,
`contracts/src/index.ts`).

1. **[LL-010] Live-data validation:** PASS. The on-disk encoding of state is
   confirmed: frontmatter `decision`/`applied` + table col `[2]` Routing / col `[5]`
   Status, with `**bold**` on routing/severity/status and backticks on target_file.
   The write mechanism (§4) is pinned to these real structures, not assumed.
2. **[LL-008] Enum decision:** CONFIRMED — the RETRO state machine is **app-OWNED**, so
   `RetroState` as a `z.enum` / discriminated union is **CORRECT** here (the documented
   exception to the external-field z.string() rule). Precedent already in the repo:
   `DriftState` is a z.enum in `contracts/src/index.ts`. The MIRRORED external fields
   stay `z.string()` (the S5a `TriageFinding.routing/status/severity` remain permissive
   — we write plain values into them but do not retype the read contract).
3. **[LL-011] Mechanism resolved (not hedged):** §4 — surgical single-cell table
   rewrite via the S5a parse anchors + `gray-matter` frontmatter round-trip + temp/
   atomic-rename; `finding_id` presence selects table-cell vs frontmatter. §5 — the
   firewall containment/allowlist mechanism, confirm-token flow, RL-5 conflict check
   are each spelled out.
4. **[LL-012] symlink/containment:** the firewall resolver classifies/contains via
   explicit `realpath` on the resolved absolute path (never input-string prefix,
   never dirent type bits); flagged for the freeze.
5. **No symbol removal/rename** in this requirement → the mandatory full-repo grep for
   removed symbols does not apply. (Additive contract + new module only.)
6. **Sub-split:** RECOMMENDED S5b-1 / S5b-2 (§2) on risk/size grounds.

## Confidence: HIGH

The authoritative design pre-exists and was read first (adr-006, domain-model,
security-model, adr-007, fs-and-vault-safety); the S5a contract + code is implemented
and was inspected directly; the on-disk write mechanism was validated against the live
template + card (LL-010). The one genuinely open mechanism — whether S5b-2's `apply`
also writes the patch *target file* vs records a transition for an out-of-band patch —
is explicitly flagged for the architect (§3 scope note) rather than guessed, so it is a
deliberate refine/freeze decision, not a confidence gap.
