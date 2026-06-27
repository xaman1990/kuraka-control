# REQ-20260625-S5b-2: apply + framework confirm-token (RL-4) + conflict serialization (RL-5) — TRANSITION-ONLY

> Second cut of S5b (the write half of S5). Builds on the FROZEN S5b-1 WriteFirewall
> (`SCHEMA-FROZEN-S5b-1.md`, shipped) and adds the highest-trust governance gates:
> the framework confirm-token (RL-4) and conflict serialization (RL-5).
>
> **The authoritative design pre-exists** (adr-006 §RL-4/RL-5/RL-6, domain-model RL-1..7,
> security-model). This REQ scopes that design for S5b-2, resolves the open mechanisms
> (token generation, conflict detection, RetroState reconciliation), and recommends a
> concrete shape. It does NOT reinvent the design.
>
> **USER-CONFIRMED SCOPE: (a) TRANSITION-ONLY.** S5b-2 records the `Aplicado` state
> transition on the **triage card** (a `triage_record` write via the existing firewall
> + S5b-1 raw-line rewriters) and gates it with the confirm-token + conflict checks. It
> does **NOT** write the gold `agents/*.md` file content (the `framework_patch` *content*
> apply is a later story). See §2 OUT and §3 scope note.

## Workflow Status
- [x] Phase 1: PO Analysis — IN PROGRESS
- [ ] Phase 2: Story Refinement
- [ ] Phase 2.5: Test Planning — FOLDED into Phase 2 (refiner co-emits AC + test matrix; T-rules — same posture as S5b-1)
- [ ] Phase 3: Architect Review (schema freeze — re-runs the only-writer grep + audits the new `framework_patch` allowlist entry + the token/conflict design)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] **Phase 5.5: Security Review — DEDICATED & MANDATORY** (gold-path gate: confirm-token + conflict serialization are the blast-radius controls; SCHEMA-FROZEN-S5a §7 + adr-006 require it; this is the second of the two S5b 5.5 passes)
- [ ] Phase 6: Tests (incl. Phase 6.8 runtime smoke against a **TEMP vault copy** — never the real `<vault>/retro-triage/`; framework-apply exercised with a real confirm-token round-trip)
- [ ] Phase 6.5: E2E — DEFERRED (the confirm modal is a 2-step UI flow; promote to E2E only if S5b-FE ships the modal in this cut — refiner decides; otherwise Phase 6 integration + 6.8 smoke cover it)
- [ ] Phase 6.7: Deployment Verification — SKIPPED (local single-user, no Docker/CI surface for this cut)
- [ ] Phase 7: Final Audit

**Pipeline rationale:** apply is the gold-path action — the confirm-token (RL-4) and
conflict serialization (RL-5) are exactly the blast-radius controls, so the **dedicated
Phase 5.5** is mandatory (not folded). 2.5 folded into 2 (refiner co-emits the test
matrix; avoids a context re-read). 6.5 deferred / 6.7 skipped per the local single-user,
no-CI posture and the S5b-1 precedent. Rule T6 applies: S5b-2 runs **sequentially after
S5b-1** (the firewall + apply are interdependent + security-relevant — no parallel backend
cuts), and `make test` runs after S5b-1 before S5b-2 starts (S5b-1 is already shipped).

## 1. Requirement Summary
S5b-2 adds the **apply** action to the RETRO triage write surface. A **project-routed**
finding is applied one-click (`Aplicado`, no token, **RL-6** backup-only — never triggers
a mount). A **framework-routed** finding requires a valid, single-use, scoped, short-TTL
**confirm-token (RL-4)**; without/with an invalid token the apply returns **403
CONFIRM_REQUIRED** carrying a freshly minted token, and the UI re-POSTs with it. Before
any apply, **RL-5 conflict serialization** refuses (409 CONFLICT) if a *sibling* triage
finding targets the same `target_file` in a conflicting state (re-read + re-validate at
apply time). **In this cut the write is the `Aplicado` transition on the triage card
itself** (a `triage_record` write reusing the S5b-1 firewall + `setFindingCell` /
`setFrontmatterDecision` rewriters) — **NOT** a `framework_patch` / `agents/*.md` content
write, which is deferred.

## 2. Scope

### In Scope (TRANSITION-ONLY)
- **`apply` action** on a triage finding/card:
  - **Per-finding** (`finding_id` present): rewrite the findings-table col `[5]` `Status` → `applied` via the FROZEN `setFindingCell(raw, finding_id, 5, "applied")` (S5b-1 §4).
  - **Card-level** (`finding_id` absent): rewrite frontmatter `decision: applied` + `applied: true` via the FROZEN `setFrontmatterDecision(raw, "applied", true)` (S5b-1 §5).
  - Either way the write is a **`triage_record`** write through the existing `writeTriageRecord` — the SAME write class S5b-1 already ships. **No new write target.**
- **Confirm-token (RL-4)** generation + validation + scope binding (§4). The token gates a **framework-routed** apply. Project-routed apply needs no token.
- **RL-5 conflict serialization** (§5): scan ALL triage docs' findings (via S5a `listTriageDocs`) for a *sibling* finding (different card OR different `finding_id`) whose `target_file` equals this finding's `target_file` AND is in a **conflicting state** (defined §5); re-read + re-validate at apply time → 409 CONFLICT if found, no write.
- **RL-6 no-mount note** (§6): a project-routed apply is backup-only and **NEVER** triggers a mount-to-other-projects. S5b-2 simply has no mount call. Documented so the architect confirms no mount edge sneaks in.
- **`framework_patch` allowlist entry** added to the data-driven `WRITE_CLASSES` table in `writeFirewall.ts` — the **entry + its confirm-token guard** are defined here (so the firewall *knows* gold is gated), **but the apply action itself only ever exercises the `triage_record` class** in this transition-only cut (the entry's *write path* is exercised by unit tests + reserved for the later content-apply story). See §3 + the GATE0 note.
- **`RetroState`** app-owned typed `z.enum` / discriminated union for the transition logic (`Aplicado`, `ApplyFailed`, plus the S5b-1 human-driven subset) — see §7 reconciliation. App-owned ⇒ z.enum is the LL-008 *exception*, CONFIRMED.
- **apply API**: `POST /api/triage/:id/apply { finding_id?, confirm_token? }` (§8) → 200 `TriageActionResponse` / 403 CONFIRM_REQUIRED / 409 CONFLICT / 404 / 400 / 403 PATH_FORBIDDEN / 500.
- **`ApplyFailed`** state surfaced on a write failure (500 WRITE_FAILED).
- **Re-read after write**: the 200 response is the freshly re-parsed `TriageDoc` (disk truth, S5b-1 §6).
- **Phase 6.8 smoke + all write tests run against a TEMP vault copy** (§9); the framework-apply path is exercised with a real confirm-token round-trip against the temp store, never the real vault.
- **Frontend confirm-token modal wiring** on `/triage` (apply button → on 403 CONFIRM_REQUIRED show modal naming the gold target → re-POST with the token; project apply is one-click). *(May ship as / fold into S5b-FE behind the frozen contract — refiner decides; `parallel_implementation: true`.)*

### Out of Scope
- **Writing the gold `agents/*.md` file content** (the actual `framework_patch` *content* diff/patch application) — **DEFERRED to a later story.** S5b-2 lands the transition + the gate; the firewall *defines* the `framework_patch` class so the gate is real, but the apply action does not author gold content.
- **Writing the project-layer target file content** (`<project>/.claude/project/**` via `project_patch`) — also deferred; transition-only here.
- **Mount / fan-out** (RL-3 `ParcialmenteSincronizado` k/N, mount-to-ALL) — S3/S7 surface. S5b-2 implements RL-6 by simply not mounting.
- **Auto-verification join** (RL-1/RL-2, K=2 close `PendienteVerificación` → `Verificado`) and the downstream states (`Sincronizado`, `Verificado`, `Regresado`, `Revertido`) — **S10**.
- **Dedup / finding-identity signature key** (RL-7, `Supersedido`) — S10.
- **`pattern-detector` agent behavior change** — domain-model Open Question #3, S10. This REQ touches no framework agent prompt.
- **Telemetry / budgets / live watcher / auth** — other stories / none by design.
- **Re-opening `Aplicado`** (rollback `Revertido`) — S10.

## 3. Table Inventory
**N/A — no database.** `orm: none` in `kuraka.config.yaml`; the vault filesystem IS the
store (C2). The persistent state S5b-2 mutates lives in `<vault>/retro-triage/*.md`
(triage cards, markdown). No table is CREATEd, ALTERed, or referenced. (Zero tables, all
justified by the no-DB architecture; nothing extra-to-ticket.) Tenant column omitted —
`conventions.multi_tenant: false` (single local operator).

### Scope note (transition-only vs target-file write) — RESOLVED by user
The parent REQ (`REQ-20260625-S5b-triage-write-actions.md` §3 / §4 scope note) flagged
two options for apply: **(a)** record `Aplicado` for a patch applied out-of-band
(transition-only), or **(b)** also write the patch *target* file via the
`framework_patch` / `project_patch` classes. **The user CONFIRMED (a) transition-only for
this ship.** Consequence for S5b-2:
- The apply action's *write* is always a **`triage_record`** write (the card's own
  table cell / frontmatter) — the proven S5b-1 path. No gold content is authored.
- The `framework_patch` allowlist **entry + confirm-token guard** are still added to the
  firewall (so the gate is enforced and unit-tested), reserving the class for the later
  content-apply story without a re-cut. The apply *action* never calls
  `writeFrameworkPatch` in this cut.
- This keeps the first gold-path Phase 5.5 review minimal: it audits the **gate
  mechanics** (token + conflict), not a gold *content* write.

## 4. Confirm-token design (RL-4) — RESOLVED

The confirm-token is the deliberate **human-in-the-loop gate for blast radius** (adr-006,
security-model "Framework write gate"). There is no auth (single local operator) — the
token exists solely to force a conscious two-step acknowledgment before a framework apply.

### 4.1 Generation
On a **framework-routed** apply POST **without** a (valid) `confirm_token`, the service
does **NOT write**; it mints a fresh token and returns **403 CONFIRM_REQUIRED** whose
`detail` carries `{ id, finding_id, target_file, confirm_token, expires_at }`.

**Recommended mechanism — stateless HMAC (no store, no DB):**
- A per-process secret `CONFIRM_SECRET` = `crypto.randomBytes(32)` generated **once at
  app start** (in-memory; never persisted, never logged, not in `.env`). Rotating on
  every restart is correct — an old token is worthless after a restart (acceptable for a
  local single operator; a restart mid-confirm just re-prompts).
- Token payload (the **scope binding**): `{ id, finding_id, target_file, issued_at }`.
  - `target_file` is the finding's `target_file` (the value the conflict check also keys
    on) — binding it means a token minted for card A / finding P2 / `rules/...md` cannot
    apply card B, finding P5, or a different target.
- `token = base64url(payload_json) + "." + base64url(HMAC_SHA256(CONFIRM_SECRET, payload_json))`.
  (A compact JWT-like envelope; no external lib — Node `crypto` only.)

### 4.2 Validation (on the re-POST)
1. Split the token at `.`; recompute the HMAC over the decoded payload with
   `CONFIRM_SECRET`; compare with `crypto.timingSafeEqual`. Mismatch → treat as missing →
   403 CONFIRM_REQUIRED (fresh token).
2. **Scope check:** the payload's `{ id, finding_id, target_file }` MUST equal the current
   request's `{ id, finding_id }` and the finding's *current* `target_file` (re-read at
   apply time). Any mismatch → 403 CONFIRM_REQUIRED. (A token is non-transferable across
   findings/cards/targets.)
3. **TTL:** `now - issued_at <= TTL`. **Recommended TTL ≈ 2 min** (matches the prompt's
   guidance; long enough for the modal, short enough that a stale token can't sit around).
   Expired → 403 CONFIRM_REQUIRED (fresh token).
4. **Single-use (replay defense):** an HMAC token is inherently *reusable* until it
   expires, which violates "not replayable after use". Add a **tiny in-memory used-token
   set** (a `Set<string>` of consumed token strings, or of `HMAC` digests) in the single
   process: on a successful apply, record the token; reject any token already in the set →
   403 CONFIRM_REQUIRED. Entries are pruned lazily once past TTL (bounded by TTL × apply
   rate — negligible). This is the ONE piece of state; everything else is stateless.
   - *Alternative if the architect prefers zero shared state:* a pure in-memory
     **single-use token store** (a `Map<scopeHash, { token, expires }>` minted on the 403,
     consumed + deleted on the re-POST). The HMAC + used-set is recommended because it
     survives the "two parallel modals" edge more cleanly and needs no minting-side store.
     **Refiner/architect pins ONE mechanism at freeze** — both satisfy: not guessable
     (HMAC over a secret), not replayable after use (used-set / delete-on-consume), not
     reusable across findings (scope binding).

### 4.3 Properties (the security contract — Phase 5.5 checklist)
| Property | Mechanism |
|----------|-----------|
| Not guessable | HMAC-SHA256 over a 32-byte per-process secret; `timingSafeEqual` compare |
| Not replayable after use | used-token set (consumed on successful apply) / delete-on-consume |
| Not reusable across findings/cards/targets | scope = `{ id, finding_id, target_file }` bound into the signed payload + re-checked |
| Time-bounded | `issued_at` in payload, TTL ≈ 2 min |
| No write before confirm | the no-token apply returns 403 + token; it NEVER writes |
| Secret never leaks | in-memory only; never in `.env`, logs, or responses (only the token is returned) |

### 4.4 Where it lives
- Token mint/verify: a small pure-ish module `backend/src/services/confirmToken.ts`
  (or co-located in `triageActions.ts` if the architect prefers). Functions:
  `mintConfirmToken(scope) → string`, `verifyConfirmToken(token, scope, now) →
  "OK" | "INVALID" | "EXPIRED" | "USED" | "SCOPE_MISMATCH"` (collapse all non-OK to
  CONFIRM_REQUIRED at the route).
- The used-token set + the per-process secret are module-level singletons (the only
  in-memory state in the backend; documented for the Phase 5.5 reviewer).

## 5. RL-5 conflict serialization — RESOLVED

**Definition — "a sibling finding targets the same file":** at apply time, scan **all**
triage docs (reuse the S5a `listTriageDocs(vaultRoot)` reader — already lists every
`*.md` non-`_` card and parses each into a `TriageDoc`), then across **every finding of
every doc**, find any finding `F'` such that:
1. `F'.target_file === thisFinding.target_file` (string-equal after the S5a backtick-strip
   normalization — both sides are the parsed `target_file`), AND
2. `F'` is **NOT** the finding being applied — i.e. NOT (`F'`'s card id === this `id` AND
   `F'.id === this finding_id`), AND
3. `F'` is in a **conflicting state**.

**Conflicting state — DEFINED:** a sibling is conflicting when it is **`applied`** OR
in a non-terminal *in-flight-toward-apply* state for that same target. Concretely, treat a
sibling finding as conflicting if its `status` (table col `[5]`) is `applied`, OR its
parent card's frontmatter `decision` is `applied`. **Non-conflicting** (do NOT block):
`deferred`, `rejected`, `pending`/blank (those siblings will never write that target, or
were dismissed). **Recommendation:** block on a sibling already **`applied`** to the same
`target_file` — that is the genuine lost-update / double-apply hazard the rule guards
(two cards applying the same patch target). The refiner/architect MAY widen "conflicting"
to include `pending` siblings if they want serialized one-applier-per-target, but the
minimal, defensible rule is **block-if-a-sibling-already-applied-the-same-target**.

> Note: in **transition-only** mode no card actually *writes* the target file, so the
> "lost update" is logical, not physical. RL-5 still matters: it prevents two cards from
> both recording `Aplicado` against the same `target_file` (which would mean the operator
> double-tracked one change, or two conflicting changes to one file). Re-reading at apply
> time (not route time) is REQUIRED because routing/status can change between route and
> apply.

**Re-read + re-validate at apply time:** the conflict scan runs **inside the apply
service, after re-reading the store, immediately before the write** — never cached from
an earlier request. (security-model "Conflict serialization": *re-validate at apply*.)

**409 response shape:** `409 CONFLICT`, code `CONFLICT`, `detail: { target_file,
conflicting_card }` where `conflicting_card` is the sibling card's `id` (and optionally
`conflicting_finding` = `F'.id`). No write. (Detail carries card ids / the target path
string already visible in the card — not an absolute fs path; consistent with SEC5/SEC10.)

## 6. RL-6 — project-routed = backup-only, NEVER mounts
A **project-routed** apply is one-click (no token) and writes ONLY the card's own
`triage_record` (transition). It **NEVER** triggers a mount to other projects: S5b-2 has
**no mount call at all** (mount is the S3/S7 surface). Even in the deferred content-apply
story, a `project_patch` would target only the **single registered project root** the
finding names — never a fan-out. This REQ documents the invariant so the architect
confirms no mount edge sneaks into the apply path (a Phase 5.5 grep for any
`spawn`/`mount` in the apply service must find none).

## 7. RetroState reconciliation (app-owned enum vs persisted string) — RESOLVED

There are **two distinct vocabularies**, and reconciling them is the key decision:

1. **The persisted/display card** keeps the S5a permissive contract: `TriageDoc.decision`,
   `TriageFinding.routing` / `.status` stay **`z.string().nullable()`** (externally-owned
   vault vocab; LL-008 rule). The apply **WRITES a concrete string** into these:
   - per-finding apply → table col `[5]` `Status` cell ← **`"applied"`** (plain, no bold);
   - card-level apply → frontmatter ← **`decision: applied`** + **`applied: true`**.
   These are exactly the strings the S5a parser reads back, so the round-trip is clean.

2. **The action/transition logic** uses a **separate app-OWNED `RetroState` `z.enum`** —
   the LL-008 *exception* (the RETRO state machine is the app's own domain, like the
   existing `DriftState` / `Governance` z.enums in `contracts/src/index.ts`). For S5b-2
   the enum covers the **human-driven subset + apply outcomes**:
   `"SinTriar" | "Enrutado" | "Aplicado" | "Diferido" | "Rechazado" | "ApplyFailed"`
   (the S10 states — `Sincronizado`, `PendienteVerificación`, `Verificado`, `Regresado`,
   `Supersedido`, `ParcialmenteSincronizado`, `Revertido` — are OUT, added when S10 lands).

   **Recommendation:** a `z.enum` (not a discriminated union) for S5b-2 — none of the
   in-scope states carry payload, so an enum is simpler; promote to a discriminated union
   only if S10 needs per-state fields (e.g. `ParcialmenteSincronizado { k, n }`). Add it
   as `RetroState` to `packages/contracts/src/index.ts` (additive; does NOT re-cut S5a).

**Reconciliation rule (the mapping):** the service computes the typed `RetroState` from
the on-disk strings for its transition logic, but **persists strings**. e.g. apply target
state `Aplicado` ⇒ writes `status: applied` / `decision: applied + applied: true`.
`ApplyFailed` is a **logic-only** state (a write that threw) — it is **NOT persisted** to
the card (the card is byte-unchanged on a failed write per the S5b-1 atomic-rename
guarantee); it surfaces as the 500 `WRITE_FAILED` response. So `RetroState` is the app's
projection; the disk encoding is the source of truth on re-read.

## 8. Affected Endpoints — apply API (FROZEN-candidate — architect freezes at Phase 3)

Added to `createTriageRouter` (the same router S5b-1 extended). Auth column omitted —
single local operator. Mirrors the S5b-1 route/error-mapping posture (`SCHEMA-FROZEN-S5b-1`
§8) exactly.

| Method | Path | Body (request) | Success | Errors |
|--------|------|----------------|---------|--------|
| POST | `/api/triage/:id/apply` | `{ finding_id?: string, confirm_token?: string }` | 200 `TriageActionResponse` (re-read `TriageDoc`) | **403 CONFIRM_REQUIRED**, **409 CONFLICT**, 404 NOT_FOUND, 400 BAD_REQUEST, 403 PATH_FORBIDDEN, 500 WRITE_FAILED / VAULT_UNREADABLE |

**Branch (project vs framework) by the finding's CURRENT `routing`** (re-read at apply):
- `routing === "project"` → one-click: run RL-5 conflict check → write `Status: applied`
  (or card-level `decision: applied`) → re-read → 200. **No token.** **No mount (RL-6).**
- `routing === "framework"` → require `confirm_token`:
  - absent/invalid/expired/used/scope-mismatch → **403 CONFIRM_REQUIRED** (mint fresh
    token in detail, NO write);
  - valid → run RL-5 conflict check → write the `Aplicado` transition (`triage_record`) →
    mark token used → re-read → 200.
- `routing` null/unset (finding not yet routed) → **400 BAD_REQUEST** (`apply` requires a
  routed finding — you route before you apply; detail `{ id }`).
- **Card-level apply** (`finding_id` absent): a card has no single `routing`. **Recommend
  400 BAD_REQUEST** ("apply is finding-scoped; route+apply per finding") — mirrors the
  S5b-1 rule that `route` without `finding_id` is 400. *(Refiner may instead define
  card-level apply as "apply all already-routed findings", but that multiplies the
  token/conflict surface; recommend deferring — finding-scoped apply only in this cut.)*

**Endpoint shape:** a **distinct `/apply` verb** (not a `PATCH { action }` discriminant),
consistent with S5b-1's four-verb design — apply alone carries `confirm_token` and the
CONFIRM_REQUIRED/CONFLICT error set, so a dedicated route keeps the zod schema + guards
small.

**Request schema (additive contract):**
```ts
export const TriageApplyRequest = z.object({
  finding_id: z.string().optional(),     // present = finding-scoped (the supported path)
  confirm_token: z.string().optional(),  // required only for a framework-routed finding
});
```
Reuses `TriageActionResponse` (`{ doc: TriageDoc }`) verbatim from S5b-1.

**`:id` guard + body validation + sentinel→HTTP mapping** follow `SCHEMA-FROZEN-S5b-1` §8
verbatim, EXTENDED with the two new sentinels:

| Service sentinel | HTTP | Code | Detail |
|------------------|------|------|--------|
| `"CONFIRM_REQUIRED"` | 403 | `CONFIRM_REQUIRED` | `{ id, finding_id, target_file, confirm_token, expires_at }` |
| `"CONFLICT"` | 409 | `CONFLICT` | `{ target_file, conflicting_card }` |
| `"NOT_FOUND"` (unknown card / finding_id) | 404 | `NOT_FOUND` | `{ id }` |
| `"BAD_REQUEST"` (unrouted / card-level apply) | 400 | `BAD_REQUEST` | `{ id }` |
| `WriteFirewallError PATH_FORBIDDEN` | 403 | `PATH_FORBIDDEN` | `{ id }` only |
| `WriteFirewallError WRITE_FAILED` | 500 | `WRITE_FAILED` | `{ id }` (service maps to `ApplyFailed`) |
| `VaultUnreadableError` | 500 | `VAULT_UNREADABLE` | `{ path }` (reuse existing) |

The `ActionResult` union (`SCHEMA-FROZEN-S5b-1` §7) is **extended additively** to
`TriageDoc | "NOT_FOUND" | "BAD_REQUEST" | "CONFIRM_REQUIRED" | "CONFLICT"`. New
error-code constant: `ERROR_CODE_CONFIRM_REQUIRED`, `ERROR_CODE_CONFLICT` (module-level,
no magic strings). New contract export: `TRIAGE_ERROR_CONFIRM_REQUIRED`,
`TRIAGE_ERROR_CONFLICT` (frontend checks by constant).

## 9. Empty / error / safety states

| Condition | HTTP | Code | Notes |
|-----------|------|------|-------|
| Card slug not found / blank / `/` / `\` | 404 | `NOT_FOUND` | `:id` guard mirrors S5b-1 |
| `finding_id` not found in the card's table | 404 | `NOT_FOUND` | no-op detect: `setFindingCell` returns input unchanged ⇒ NOT_FOUND |
| Card-level apply (`finding_id` absent) | 400 | `BAD_REQUEST` | apply is finding-scoped (recommended) |
| Finding not yet routed (`routing` null) | 400 | `BAD_REQUEST` | route before apply |
| Invalid body (bad token type, etc.) | 400 | `BAD_REQUEST` | zod safeParse at route; detail `{}` |
| Framework apply, no/invalid/expired/used token | 403 | `CONFIRM_REQUIRED` | detail carries a FRESH token + gold target; **NO write** |
| RL-5 sibling already-applied same `target_file` | 409 | `CONFLICT` | detail `{ target_file, conflicting_card }`; **NO write** |
| Path escape / traversal / consumer path | 403 | `PATH_FORBIDDEN` | firewall; detail `{ id }` only, never abs path (SEC5/SEC10) |
| Write itself failed (disk/perms/rename race) | 500 | `WRITE_FAILED` | `ApplyFailed`; card byte-unchanged (atomic rename); no silent failure |
| `retro-triage/` unreadable | 500 | `VAULT_UNREADABLE` | reuse existing `VaultUnreadableError` |
| Empty store / nonexistent card | 404 | `NOT_FOUND` | apply operates on an existing `:id` |

## 10. Smoke / test safety constraint — Phase 6.8 (MANDATORY)
Identical isolation posture to S5b-1 (`SCHEMA-FROZEN-S5b-1` §10), EXTENDED for the
gold path:
- EVERY test that writes uses a **TEMP vault**: `fs.cp` the real `retro-triage/` (or a
  fixture) into an OS temp dir; inject via `createApp({ vaultRoot: tmpDir })` /
  `createTriageRouter({ vaultRoot })`. **NEVER** `process.env.KURAKA_VAULT` directly.
- **Framework-apply path** is exercised with a **real confirm-token round-trip** against
  the TEMP store: POST apply (no token) → assert 403 CONFIRM_REQUIRED + a token in detail
  → re-POST WITH that token → assert 200 + the temp card's `Status` cell mutated on disk →
  assert a replay of the SAME token → 403 (used). The **real vault is never touched**
  (assert the real card's content/mtime unchanged, or simply never reference its path).
- **RL-5** is exercised by seeding the temp store with two cards targeting the same
  `target_file` (one already `applied`) → assert apply on the second → 409 CONFLICT, no
  disk change.
- **RL-6** smoke: assert the apply service makes **no `spawn`/mount call** (grep the apply
  path; or assert no subprocess in the integration test).
- The only-writer grep still holds (only `writeFirewall.ts` calls `fs.write*`):
  `grep -rE "fs\.(writeFile|rename|mkdir|rm)" backend/src --include="*.ts" --exclude="*.test.ts"` → `writeFirewall.ts` only.
- Teardown `fs.rm(tmpDir, { recursive: true, force: true })`.

## 11. Affected Services & Repositories

File paths follow `architecture.layers` (route → service → repository → domain) and the
live S1–S5b-1 layout. No DB / migrations (`orm: none`).

> **Stack-profile gap (flag, carried from S5b-1):** `.claude/stack-profiles/` has only
> `python-fastapi.md` + `vue-pinia.md` (inherited from `sie_v2`) — NO `express.md` /
> `react.md` profile. File-layout guidance is derived from the live S1–S5b-1 code; the
> architect should treat the existing repo layout as the de-facto profile.

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/src/index.ts` | ALTER | Add `TriageApplyRequest` (z.object `{ finding_id?, confirm_token? }`), `RetroState` (z.enum, app-owned — LL-008 exception, §7), and the error constants `TRIAGE_ERROR_CONFIRM_REQUIRED` / `TRIAGE_ERROR_CONFLICT`. Additive — does NOT re-cut the FROZEN S5a/S5b-1 contracts. |
| `backend/src/services/confirmToken.ts` | CREATE | Confirm-token mint + verify (HMAC over `{id,finding_id,target_file,issued_at}` with a per-process secret; TTL ≈ 2 min; used-token set). `mintConfirmToken` / `verifyConfirmToken`. The ONLY in-memory state in the backend (documented for 5.5). |
| `backend/src/services/confirmToken.test.ts` | CREATE | Unit: HMAC tamper rejected, scope-mismatch rejected, expired rejected, replay (used) rejected, valid accepted, `timingSafeEqual` path. |
| `backend/src/services/triageActions.ts` | ALTER | Add `applyTriage(input: { id, finding_id?, confirm_token?, vaultRoot })`. Re-read card → resolve finding + its current `routing`/`target_file` → RL-5 conflict scan (via `listTriageDocs`) → framework branch: verify/ mint token → write `Status: applied` (or fm `decision/applied`) via `writeTriageRecord` + `setFindingCell`/`setFrontmatterDecision` → re-read → return doc. Extend `ActionResult` with `"CONFIRM_REQUIRED" \| "CONFLICT"`. |
| `backend/src/services/triageActions.test.ts` | ALTER | Add: project one-click apply, framework 403→token→200, RL-5 409, unrouted→400, finding-not-found→404, ApplyFailed/WRITE_FAILED, RL-6 no-mount assertion. |
| `backend/src/repositories/writeFirewall.ts` | ALTER | Add the `framework_patch` entry to the data-driven `WRITE_CLASSES` table (root `<vault>/agents/`, filename regex, `requiresConfirmToken: true` guard) so the gate is real + unit-tested. **No `writeFrameworkPatch` *action* is exported / called** in the transition-only cut (the entry's write path is reserved + tested, not exercised by apply). Extend `WriteFirewallCode` if a CONFIRM-class denial is surfaced here (or keep token logic in the service — architect decides; recommend service-side token, firewall only asserts "token present for framework_patch"). |
| `backend/src/repositories/writeFirewall.test.ts` | ALTER | Add: `framework_patch` entry containment + the confirm-token-required denial; `agents/` path allowed only with the guard; traversal still denied. Against a TEMP dir. |
| `backend/src/routes/triage.ts` | ALTER | Add `POST /:id/apply` to `createTriageRouter`. `:id` guard; `TriageApplyRequest.safeParse`; map `"CONFIRM_REQUIRED"`→403, `"CONFLICT"`→409, plus the S5b-1 mappings; new error-code constants. |
| `backend/src/routes/triage.test.ts` | ALTER | Route-level: 403 CONFIRM_REQUIRED envelope (+ token in detail), 409 CONFLICT envelope, 200 re-read shape, 400/404/500 paths; injected TEMP `vaultRoot`. |
| `frontend/src/api/triage.ts` | ALTER | Add `applyFinding` caller; surface CONFIRM_REQUIRED token + target from the 403 detail; pass `confirm_token` on the re-POST. |
| `frontend/src/routes/TriageDetailPage.tsx` (+ `TriageCard.tsx`) | ALTER | Apply button per finding; project = one-click + react-query invalidate; framework = on 403 show a **confirm modal** naming the gold `target_file` → confirm re-POSTs with the token; 409 surfaces a "conflicts with {card}" message. GovernanceBadge gold/jade reflects routing (adr-007). *(May fold into / be S5b-FE behind the frozen contract.)* |
| `backend/src/index.ts` | NONE | `createTriageRouter` already mounted under `/api`; route added inside the existing router. |

## 12. State-transition table (S5b-2 subset)
App-owned typed `RetroState` (`enums_for_states: true`; LL-008 exception, §7). S5b-2 adds
the **apply** transitions on top of S5b-1's route/defer/reject.

| From | Action | To | RL | Write (transition-only) |
|------|--------|----|----|--------------------------|
| `Enrutado(proyecto)` | apply (one-click, no token) | `Aplicado` | RL-4 one-click (project), RL-5 conflict, RL-6 no-mount | table col `[5]` `Status: applied` / fm `decision:applied`+`applied:true` — `triage_record` |
| `Enrutado(marco)` | apply (needs valid `confirm_token`) | `Aplicado` | RL-4 confirm token, RL-5 conflict | table col `[5]` `Status: applied` — `triage_record` (NO `agents/*.md` content write — deferred) |
| `Enrutado(marco)` | apply (no/invalid token) | (unchanged) | RL-4 | **NONE** — 403 CONFIRM_REQUIRED + fresh token |
| any | apply (sibling already applied same target) | (unchanged) | RL-5 | **NONE** — 409 CONFLICT |
| `Aplicado` (write threw) | — | `ApplyFailed` | — | NONE (logic-only; 500 WRITE_FAILED; card byte-unchanged) |

**Deferred to S10:** `Aplicado → Sincronizado → PendienteVerificación → Verificado |
Regresado`, `Supersedido`, `ParcialmenteSincronizado`, `Revertido`. S5b-2's terminal-for-
now apply states are `Aplicado` and `ApplyFailed`.

## 13. Dependencies
- **S5b-1 (WriteFirewall + route/defer/reject)** — DONE & FROZEN. Reuses `writeTriageRecord`, the data-driven `WRITE_CLASSES` table (adds the `framework_patch` entry), `setFindingCell` / `setFrontmatterDecision` (FROZEN §4/§5), the `ActionResult` sentinel pattern, the `:id` guard + error-mapping posture, `TriageActionResponse`.
- **S5a (read board)** — DONE & FROZEN. Reuses `listTriageDocs` (the RL-5 sibling scan seam), `parseTriageDoc`, the `TriageDoc`/`TriageFinding` contract (incl. `target_file`), the `vaultRoot` injection seam, `VaultUnreadableError`, `ApiError` envelope.
- **adr-006 / domain-model (RL-4/5/6) / security-model** — frozen design inputs (this REQ scopes them).
- **Node `crypto`** — stdlib; HMAC + `randomBytes` + `timingSafeEqual` for the confirm-token. No new dependency.
- **Live registry reader (S1)** — NOT needed in transition-only (it would only matter for the deferred `project_patch` *content* write).
- **Internal:** `RetroState` becomes the shared union S10 extends (verification join). S5b-2 freezes the apply subset.

## 14. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gold (`agents/*.md`) applied without human intent | High | RL-4 confirm-token: single-use, scoped, short-TTL, HMAC; framework apply is 403 CONFIRM_REQUIRED until confirmed. (Transition-only ⇒ no gold *content* write at all this cut — gate is reviewed before content-apply lands.) |
| Confirm-token replay / reuse across findings | High | Scope binding `{id,finding_id,target_file}` in the signed payload + re-check; used-token set consumed on apply; TTL ≈ 2 min |
| Confirm-token guessable / forgeable | High | HMAC-SHA256 over a 32-byte per-process secret; `timingSafeEqual`; secret in-memory only, never logged / in `.env` |
| Two cards apply the same target → lost/double tracking | Medium | RL-5: re-read + sibling scan at apply time (`listTriageDocs`); 409 on a sibling already-applied same `target_file` |
| A mount edge sneaks into the apply path (RL-6 breach) | Medium | No `spawn`/mount in the apply service; Phase 5.5 grep asserts none; documented invariant |
| Test/smoke writes to the REAL vault | High | TEMP-vault-copy mandatory (§10); `vaultRoot` injection; framework-apply round-trip runs on temp only |
| A write escapes the firewall | High | Single-writer invariant unchanged; only-writer grep (§10); apply uses `writeTriageRecord` only |
| Crash mid-write truncates a card | Medium | S5b-1 atomic temp+rename (FROZEN §3) — reused unchanged |
| `framework_patch` entry added but mis-guarded (allows gold write without token) | High | The entry's `requiresConfirmToken` guard is unit-tested in `writeFirewall.test.ts`; Phase 5.5 audits the entry; apply action never calls the gold write path this cut |
| Scope creep: card-level "apply all" multiplies token/conflict surface | Low–Med | Recommend finding-scoped apply only; card-level apply → 400 (refiner may revisit) |
| Stack-profile gap (no express/react profile) | Low | Use live S1–S5b-1 layout as de-facto profile; flagged for architect |

## 15. Proposed Stories

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S5b-2 | apply (project one-click → `Aplicado`) + framework apply (RL-4 confirm-token, HMAC, single-use/scoped/TTL) + RL-5 conflict serialization + RL-6 no-mount + `ApplyFailed` + `framework_patch` allowlist entry (gate only, transition-only) + `RetroState` enum + `TriageApplyRequest` | M–L | S5b-1 (shared frozen contract), S5a |
| S5b-FE | Frontend apply wiring (one-click project apply; framework confirm-token modal naming the gold target; 409 conflict message; re-read/invalidate) — behind the frozen contract | M | S5b-2 contract frozen |

> Refiner/architect may merge S5b-FE into S5b-2 or keep separate per
> `parallel_implementation: true`. Recommend: freeze the contract at Phase 3, run S5b-2
> backend, then S5b-FE (the modal needs the frozen 403 detail shape). Rule T6: S5b-2 is
> security-relevant + interdependent with the firewall → no parallel backend cuts; `make
> test` after S5b-2 before any follow-up.

## GATE0 — resolved decisions (authoritative design read FIRST; PASS)

Read & frozen against: `REQ-20260625-S5b-triage-write-actions.md` (parent — §3 scope note
confirms transition-only is option (a); §4 apply row), `adr-006-write-firewall.md`
(RL-4/RL-5/RL-6 + the write-class allowlist), `domain-model.md` (RetroState RL-1..7),
`security-model.md` (write firewall, framework write gate, conflict serialization),
`SCHEMA-FROZEN-S5b-1.md` (the firewall surface, `WRITE_CLASSES` data-driven table,
`setFindingCell`/`setFrontmatterDecision`, `ActionResult` sentinel + route mapping —
reused verbatim). Live data inspected (LL-010): `<vault>/retro-triage/_TEMPLATE.md` +
`2026-06-06-sie_v2.md` (1 card, 6 findings; col `[3]` = `Target file`, the RL-5 key; P2
routing `**framework**`), the shipped S5b-1 code (`writeFirewall.ts` with the data-driven
`WRITE_CLASSES`, `triageActions.ts` `ActionResult`), the S5a `triageReader.listTriageDocs`,
and the contract (`TriageFinding.target_file` / `.routing` / `.status`).

1. **[LL-010] Live-data validation:** PASS. `target_file` (backtick-stripped) is the real
   conflict key; `routing`/`status` are the real per-finding cells the apply writes/reads.
   The transition write reuses the S5b-1 FROZEN rewriters against these structures, not
   assumptions.
2. **[LL-008] Enum decision:** CONFIRMED — `RetroState` is **app-OWNED** ⇒ `z.enum` is the
   documented LL-008 *exception* (precedent: `DriftState`/`Governance` z.enums in
   `contracts`). The mirrored external fields (`TriageDoc.decision`,
   `TriageFinding.routing`/`status`) stay `z.string()`; apply writes plain values into
   them but does not retype the read contract. Reconciliation spelled out in §7.
3. **[LL-013] Surgical raw-line write:** the apply transition is a surgical
   `setFindingCell` / `setFrontmatterDecision` raw-line edit (FROZEN S5b-1 §4/§5) —
   NEVER `matter.stringify` (verified corrupts the frontmatter). Confirmed.
4. **[LL-011] Mechanisms resolved (not hedged):** confirm-token (§4: HMAC + scope binding
   + TTL + used-set), RL-5 conflict (§5: `listTriageDocs` sibling scan, conflicting-state
   defined, re-read at apply), RL-6 (§6: no mount call), RetroState reconciliation (§7).
   The ONE remaining architect choice (HMAC+used-set vs in-memory single-use store) is
   explicitly offered with a recommendation, not guessed.
5. **No symbol removal/rename** in this requirement → the mandatory full-repo grep for
   removed symbols does not apply. (Additive contract + additive allowlist entry + new
   `confirmToken.ts` module; nothing renamed/removed.)
6. **Transition-only boundary (USER-CONFIRMED):** the apply *write* is always a
   `triage_record` transition; the `framework_patch` allowlist entry is added (gate is
   real + tested) but its gold *content* write path is reserved for a later story (§3).

## Confidence: HIGH
The authoritative design pre-exists and was read first; S5b-1 is shipped and FROZEN and
was inspected directly (the firewall's data-driven allowlist + the `ActionResult` sentinel
pattern make S5b-2 cleanly additive); the RL-5 key (`target_file`) and the per-finding
write cells were validated against the live card (LL-010). The transition-only boundary is
user-confirmed, removing the parent REQ's one open mechanism. The single remaining genuine
choice — the confirm-token storage shape (stateless HMAC + used-set vs in-memory single-use
store) — is explicitly flagged for the architect with a recommendation, a deliberate
freeze decision rather than a confidence gap.
