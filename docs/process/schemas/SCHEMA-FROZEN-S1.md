# SCHEMA-FROZEN-S1 — Registry contract

> **FROZEN AT 2026-06-20T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for Phase 4. This is the exact `packages/contracts/src/index.ts`
> shape for the registry seam. S2–S4 inherit it. Any deviation requires a new
> architect-review cycle, not an inline edit.

## 1. Casing boundary decision (FROZEN)

| Layer | Casing | Rule |
|-------|--------|------|
| Vault frontmatter (`<vault>/projects/*.md`) | snake_case | external, owned by the framework |
| `packages/contracts` zod schema + inferred TS | **snake_case** | mirrors frontmatter 1:1; the repository projects field-for-field, no rename map |
| Backend (domain/repository/service/route) | **snake_case** | consumes the contract type directly |
| Frontend API fetcher + react-query cache | **snake_case** | parses `ProjectListResponse` as-is |
| `ProjectCardProps` / `ProjectDetailShell` props | **snake_case** | AC-17: props are `ProjectSummary` fields directly |

**Decision: the API returns snake_case keys mirroring the frontmatter; there is
NO camelCase boundary.** Rationale: the arki-seeded contract is already
snake_case, the registry is a pure projection of snake_case frontmatter, and a
rename map is dead weight + a drift surface for S2–S4. The single shared zod
schema is the source of truth on both sides (TS convention: never hand-redeclare).

**Required consequence (resolves the only real mismatch):** the pre-existing
`ProjectCard` prop `kurakaVersion?: string | null` is **camelCase** and the local
`ProjectStatus` union types `status`. Phase 4 MUST refactor `ProjectCardProps` to:
- rename `kurakaVersion` → `kuraka_version` (snake_case, matches `ProjectSummary`),
- change `status: ProjectStatus` → `status: string`,
- delete the local `ProjectStatus` alias and the local `statusVariant` map
  (replaced by `KNOWN_STATUS_VARIANT`).

This is the casing inconsistency flagged in the prompt; it is resolved in favor of
snake_case everywhere, and the camelCase prop is the thing that changes.

## 2. `governance` derivation rule (FROZEN)

`governance: z.literal("project")` — a **server-derived constant**, NOT read from
frontmatter (frontmatter has no `governance` key; verified against live files).

- Every entry in `<vault>/projects/*.md` is a registered consumer project →
  jade / project-native by definition.
- gold / `"framework"` is reserved for the vault's own `agents/*.md` (a different
  reader, not this endpoint). It will never appear in a `ProjectSummary`.
- The narrowed literal `"project"` is assignable to the existing
  `Governance = z.enum(["framework","project"])`, so `GovernanceBadge`
  (which accepts `Governance`) consumes `summary.governance` with no widening.
- The repository sets `governance: "project"` on every projected record before
  the zod parse; it is not optional and not nullable.

## 3. Field-level rules (FROZEN)

| Field | zod | Source | Normalization (repository, pre-parse) |
|-------|-----|--------|----------------------------------------|
| `name` | `z.string()` | frontmatter | required key; if missing → skip the whole file (degrade) |
| `path` | `z.string()` | frontmatter | required; NOT used as identity (A3 duplicate paths exist) |
| `stack` | `z.string()` | frontmatter | — |
| `kuraka_version` | `z.coerce.string()` | frontmatter | YAML parses bare `0.3.4` as a number; coerce → `"0.3.4"` |
| `has_project_layer` | `z.boolean()` | frontmatter | — |
| `default_mode` | `z.string()` | frontmatter | — |
| `status` | `z.string()` | frontmatter | **permissive** (was enum). UI badge-maps known set + neutral fallback |
| `repo_url` | `z.string().nullable()` | frontmatter | `""` → `null` |
| `focus_scope` | `z.string().nullable()` | frontmatter | `""` → `null` |
| `last_mount` | `z.string().nullable()` | frontmatter | `""` → `null` |
| `last_sync` | `z.string().nullable()` | frontmatter | `""` → `null` |
| `tags` | `z.array(z.string())` | frontmatter | absent → `[]` |
| `governance` | `z.literal("project")` | **derived** | set server-side to `"project"`; never from frontmatter |

`""` → `null` normalization happens in the **repository layer before zod parse**
(domain stays pure). The schema types nullability; it does not rewrite `""`.

## 4. EXACT zod source for `packages/contracts/src/index.ts`

Replace the current `ProjectSummary` block (lines 47–61) with the following.
`ProjectListResponse`, `ApiError`, and `Governance` are UNCHANGED — keep them.

```ts
/** Registry entry — projection of <vault>/projects/*.md frontmatter (S1). */
export const ProjectSummary = z.object({
  name: z.string(),
  path: z.string(),
  stack: z.string(),
  kuraka_version: z.coerce.string(),
  has_project_layer: z.boolean(),
  default_mode: z.string(),
  status: z.string(),
  repo_url: z.string().nullable(),
  focus_scope: z.string().nullable(),
  last_mount: z.string().nullable(),
  last_sync: z.string().nullable(),
  tags: z.array(z.string()),
  governance: z.literal("project"),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectListResponse = z.object({
  projects: z.array(ProjectSummary),
  empty: z.boolean(),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;
```

### Inferred types (consumed both sides; never hand-redeclared)

```ts
type ProjectSummary = {
  name: string;
  path: string;
  stack: string;
  kuraka_version: string;
  has_project_layer: boolean;
  default_mode: string;
  status: string;
  repo_url: string | null;
  focus_scope: string | null;
  last_mount: string | null;
  last_sync: string | null;
  tags: string[];
  governance: "project";
};

type ProjectListResponse = { projects: ProjectSummary[]; empty: boolean };
```

## 5. Error envelope (FROZEN — already in contracts, reused)

`GET /api/projects` returns `ApiError` (existing schema) on `VAULT_UNREADABLE`:

```json
{ "error": { "code": "VAULT_UNREADABLE", "message": "Cannot read the Kuraka vault",
             "detail": { "path": "<env.vaultRoot>" } } }
```

- `500` `VAULT_UNREADABLE` — projects dir missing/unreadable (env points nowhere / no perm).
- `200` `{ projects: [], empty: true }` — dir exists, zero `.md` files (empty ≠ error).
- `200` `{ projects: [...], empty: false }` — happy path; malformed files silently skipped (logged to stderr).

No `/api/projects/:name` in S1 — the detail shell reads from the `["projects"]`
react-query cache by `name`. This is sound: S1 detail is a placeholder with no
data beyond the card; adding the endpoint now would pre-cut a response shape that
S2–S4 own. Confirmed it does NOT force a contract change in S2.

## 6. Frontend status mapping (FROZEN — co-located in ProjectCard, NOT in contract)

Module-level `const KNOWN_STATUS_VARIANT` (exact name, AC-15). Values restricted
to the four valid `Badge` variants (`neutral | accent | jade | muted`):

```ts
const KNOWN_STATUS_VARIANT: Record<string, "accent" | "jade" | "neutral" | "muted"> = {
  active: "jade",
  paused: "neutral",
  onboarding: "accent",
  archived: "muted",
  mapped: "accent",
};
// unknown status → "neutral" badge, displaying the literal status string.
```

This is a UI concern; it is deliberately NOT in `packages/contracts` because the
`status` vocabulary is owned by the vault, not the API seam.

---

**Vault path source:** `env.vaultRoot` (`backend/src/config/env.ts`,
`process.env.KURAKA_VAULT ?? DEFAULT_VAULT`, already `path.resolve`d). No new env
var. No hardcoded path in the repository layer.

**FROZEN AT 2026-06-20T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
