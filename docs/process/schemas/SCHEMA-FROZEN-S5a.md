# SCHEMA-FROZEN-S5a — RETRO Triage (READ-ONLY) contract + parse mechanism

> **FROZEN AT 2026-06-24T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for Phase 4. This is the exact `packages/contracts/src/index.ts`
> shape, parse algorithm, reader rules, and endpoint/error mapping for the
> read-only RETRO Triage seam (S5a). Writes / state machine = S5b (separate cut,
> separate Phase 5.5). Any deviation requires a new architect-review cycle, not an
> inline edit.

## 0. Verification basis (GATE0, re-checked at freeze)

Validated directly against the live store
`/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/retro-triage/`:

- `2026-06-06-sie_v2.md` — 1 real card, 6 findings (`P1`..`P6`), `**framework**`
  bold on P2's routing, backtick-wrapped target paths, `## Decisions & rationale`
  + `## Follow-up`. `tags: [retro-triage]`, `applied: true`, `decision: applied`.
- `_TEMPLATE.md` — excluded by `_` prefix; contains a blank placeholder row
  `| 2 | | | | | |` the parser must skip.

Lineage inherited verbatim: `ApiError` envelope, `empty: boolean` hint (S1),
`VaultUnreadableError`→500 mapping (projects route), per-file degrade + stderr
log (`projectRegistry`), snake_case 1:1 boundary (SCHEMA-FROZEN-S1), permissive
`z.string()` for external vocab (LL-008, api-contract.md), shared display-map
exported once (LL-009), `GovernanceBadge` `governance: "framework" | "project"`.

## 1. Casing boundary (FROZEN)

snake_case end-to-end, identical to S1 lineage. The shared zod schema is the only
type source on both sides. No camelCase boundary, no rename map.

## 2. Exact contract (add to `packages/contracts/src/index.ts`)

```ts
// ---- S5a: RETRO Triage (READ-ONLY projection of <vault>/retro-triage/*.md) ----
// ALL vocab fields mirror externally-owned vault values → z.string(), NO z.enum (LL-008).
// Map known values → UI variant at the component layer with a neutral fallback.

/** One row of a triage doc's findings table. Externally-owned vocab → permissive. */
export const TriageFinding = z.object({
  id: z.string().nullable(),           // "#" cell: P1.. or 1.. ; null on blank
  finding: z.string().nullable(),      // description (may contain commas/parens)
  routing: z.string().nullable(),      // framework|project (md bold stripped) — UI→governance color
  target_file: z.string().nullable(),  // backticks stripped
  severity: z.string().nullable(),     // HIGH|MED|... — externally-owned
  status: z.string().nullable(),       // applied|pending|... — externally-owned
});
export type TriageFinding = z.infer<typeof TriageFinding>;

/** One triage doc = frontmatter meta + findings + rationale prose. */
export const TriageDoc = z.object({
  id: z.string(),                      // filename minus ".md" (e.g. "2026-06-06-sie_v2")
  project: z.string().nullable(),
  source: z.string().nullable(),
  date: z.string().nullable(),         // YYYY-MM-DD verbatim, NOT a Date
  decision: z.string().nullable(),     // pending|applied|rejected|deferred — externally-owned
  applied: z.boolean().nullable(),
  tags: z.array(z.string()),           // [] never null
  findings: z.array(TriageFinding),    // [] when table absent/all-blank
  rationale: z.string().nullable(),    // raw md under "## Decisions & rationale"
});
export type TriageDoc = z.infer<typeof TriageDoc>;

export const TriageListResponse = z.object({
  docs: z.array(TriageDoc),
  empty: z.boolean(),                  // true ⇔ docs.length === 0 (api-contract: empty≠error)
});
export type TriageListResponse = z.infer<typeof TriageListResponse>;
```

**FROZEN field list:**
- `TriageFinding`: `id`, `finding`, `routing`, `target_file`, `severity`, `status` — all `z.string().nullable()`.
- `TriageDoc`: `id` (non-null), `project`, `source`, `date`, `decision`, `applied` (`z.boolean().nullable()`), `tags` (`z.array(z.string())`, never null), `findings` (`z.array(TriageFinding)`), `rationale`.
- `TriageListResponse`: `docs` (`z.array(TriageDoc)`), `empty` (`z.boolean()`).

No `z.enum` anywhere. `applied` is `boolean | null` (frontmatter omission → null).
`tags` defaults to `[]` (non-array or missing → `[]`, never null).

## 3. Table-parse algorithm (FROZEN — copy-ready, LL-011)

Pure function in `backend/src/domain/triage.ts`. Input = raw file text. Never throws.

```
parseTriageDoc(rawText) -> TriageDoc without `id` (reader sets id from filename):

A. FRONTMATTER
   1. parsed = gray-matter(rawText)  → parsed.data (frontmatter), parsed.content (body)
   2. meta fields (snake_case 1:1):
        project   = str(data.project)  || null   // "" → null, missing → null
        source    = str(data.source)   || null
        date      = str(data.date)     || null    // verbatim, NOT coerced to Date
        decision  = str(data.decision) || null
        applied   = typeof data.applied === "boolean" ? data.applied : null
        tags      = Array.isArray(data.tags) ? data.tags.map(String) : []
      (str(x): if x == null → ""; else String(x). Trim, then ""→null where noted.)

B. FINDINGS TABLE
   Operate on parsed.content split into lines.
   1. FIND HEADER: scan lines for the first line that:
        - starts (after trim) with "|", AND
        - when split into trimmed cells, contains a cell == "finding" (lower-cased)
          AND a cell == "routing" (lower-cased).
      If no such header → findings = [] (missing-table case). Skip to C.
   2. SKIP SEPARATOR: the line immediately after the header. Treat as separator
      and skip it IF every non-empty cell consists only of chars in {- : space}.
      (If it is NOT a separator — defensive — do not consume it; treat as a body row.)
   3. ITERATE BODY: for each subsequent line:
        - STOP if the line is blank (trim === "") OR starts (after trim) with "##".
          (These are the only stop conditions; end-of-content also stops.)
        - If the trimmed line does NOT start with "|", STOP (table body ended).
        - Otherwise split the line on "|".
   4. CELL EXTRACTION per body line:
        - split(rawLine, "|")  → drop the FIRST and LAST element ONLY IF they are
          empty after trim (the outer-pipe artifacts). Trim every remaining cell.
        - SKIP-BLANK-ROW: if every resulting cell is "" → skip this row entirely
          (template blanks like "| 2 | | | | | |").
   5. NORMALIZE DECORATIONS (after trim, per cell):
        - routing, severity, status: strip a SURROUNDING "**...**" bold wrapper
          (i.e. if cell starts with "**" and ends with "**", remove both), then trim.
        - target_file: strip SURROUNDING backticks (leading + trailing "`"), then trim.
        - finding, id: no decoration stripping.
        - After normalize, "" → null for EVERY field.
   6. MAP BY COLUMN ORDER (positional, header column order is fixed at 6):
        [0]=id, [1]=finding, [2]=routing, [3]=target_file, [4]=severity, [5]=status
        - SHORT ROW (fewer cells than 6): missing trailing fields → null.
        - LONG ROW (more cells than 6): ignore extra trailing cells.
        - Never throw on arity mismatch (degrade only).
   7. findings = the mapped TriageFinding[] (blank rows already skipped).

C. RATIONALE
   1. Find the heading line whose trimmed text === "## Decisions & rationale"
      (case-insensitive, exact heading text match).
   2. Capture all lines AFTER it until the next line starting (after trim) with "##"
      OR EOF. Join with "\n", trim outer whitespace.
   3. "" → null. (Raw markdown preserved; "## Follow-up" is NOT captured.)
```

**Verified traces (freeze evidence):**

- *sie_v2 P1 row* → split → outer empties dropped → 6 cells; `routing`=`project`
  (no bold), `target_file` backticks stripped to
  `sie_v2-project-layer/agents/backend-developer.append.md`. The `finding` cell
  has commas/parens but no `|` → split is safe. PASS.
- *sie_v2 P2 row* → `routing` cell = `**framework**` → bold stripped → `framework`
  → UI maps to gold. PASS.
- *Separator* `|---|---------|---------|...` → cells only `-` → skipped. PASS.
- *Stop* → the blank line before `## Decisions & rationale` ends the body; rationale
  captured from `## Decisions & rationale` to `## Follow-up`. PASS.
- *Template blank row* `| 2 | | | | | |` → all cells "" → skipped. PASS.

**KNOWN LIMITATION (documented, accepted for S5a — NOT a blocker):** the cell
splitter is a literal `split("|")`. A finding/target cell containing a LITERAL
`|` (e.g. an escaped `\|` or an inline-code path with a pipe) would mis-split into
extra cells. The live store has no such case (verified). The long-row rule
degrades it (extra cells ignored / fields shift) rather than throwing, so the
batch survives. If a future card needs pipes-in-cells, S5b/its own cut must
upgrade the splitter to honor `\|` escaping — out of scope for S5a. Phase 4 MUST
add a domain test documenting current behavior on an escaped-pipe row so the
limitation is explicit, not silent.

## 4. Reader / degradation rules (FROZEN)

`backend/src/repositories/triageReader.ts`:

1. Dir = `path.join(vaultRoot, "retro-triage")`. `readdir` failure (missing /
   unreadable) → throw the EXISTING `VaultUnreadableError` (import from
   `projectRegistry.js`; do not define a new one).
2. Candidate files: `*.md` AND basename does NOT start with `_` (excludes
   `_TEMPLATE.md` and any future `_*`).
3. For each candidate: read text → `parseTriageDoc` → set `id` = basename minus
   `.md`. Push to results.
4. PER-FILE DEGRADE: any error reading/parsing a single file → skip it + write
   `[triageReader] skipped <name>: <msg>` to stderr (mirror `projectRegistry`),
   never abort the batch. A malformed-but-parseable doc keeps whatever parsed
   (partial findings / null meta).
5. Returns `TriageDoc[]` (may be `[]`).

`backend/src/services/triageList.ts`:
- `{ docs, empty: docs.length === 0 }`.

## 5. Endpoint + error mapping (FROZEN)

| Method | Path | Success | Error |
|--------|------|---------|-------|
| GET | `/api/triage` | 200 `TriageListResponse` | 500 `ApiError(code: "VAULT_UNREADABLE")` |

- `createTriageRouter({ vaultRoot? })`, mounted under `/api` in `index.ts`.
- 500 envelope shape IDENTICAL to projects route:
  `{ error: { code: "VAULT_UNREADABLE", message: "...", detail: { path } } }`.
  Use a `const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE"` constant (no
  magic string), matching `routes/projects.ts`.
- **NO `GET /api/triage/:id` in S5a.** List carries every doc in full; detail is
  client-side selection by `id`. S5b may add `:id` when it needs per-doc server
  work (lock for transition) — that addition does NOT re-cut this contract
  (additive). FROZEN as forward-compatible.

## 6. `id`-slug rule (FROZEN)

`TriageDoc.id` = filename with the trailing `.md` removed, verbatim
(e.g. `2026-06-06-sie_v2.md` → `2026-06-06-sie_v2`). The client `/triage/:id`
route (if route-based detail) uses this exact slug.

## 7. fs-safety posture (FROZEN — confirms 5.5 fold)

Read-only: `readdir` + `readFile` only. Vault path from config (`KURAKA_VAULT`),
never client-supplied. No path traversal surface (no `:id` server param reaches
the fs; detail is client-side). No subprocess / exec. Folding Phase 5.5 into S5a
is LEGITIMATE on this basis. S5b reintroduces writes and MUST run a dedicated 5.5.
