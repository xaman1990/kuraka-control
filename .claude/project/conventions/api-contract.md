# Convention — API contract & error shape

- Every endpoint's request + response is a **zod schema** in `packages/contracts`.
  The route validates the request with it; the frontend infers types from it.
- **Uniform error envelope** (no silent failure, NFR). Errors return:
  ```json
  { "error": { "code": "VAULT_UNREADABLE|SCRIPT_FAILED|CONFLICT|NOT_FOUND|...",
               "message": "human text", "detail": { } } }
  ```
- **Governance action results** carry the subprocess facts the UI must show:
  ```json
  { "exitCode": 0, "stdout": "...", "stderr": "...", "durationMs": 1234,
    "requiresRestart": true }
  ```
- **Empty is not an error.** Empty registry / empty telemetry / empty triage
  return `200` with an empty collection + an explicit `empty: true` hint so the UI
  renders a first-class empty state (telemetry starts empty).
- The live channel is `GET /api/live` (SSE), event `agent-state`, payload per
  adr-004. Falls back to polling when the watcher is disabled.

## App-owned vs externally-owned contract fields  [LL-007, LL-008]

- `enums_for_states` applies **only** to fields whose values *this app* controls
  (e.g. the RETRO/triage state machine — a typed `z.enum`/union).
- A contract field that **mirrors an external source** (vault frontmatter such as
  `status`, or vault-script output) is typed **`z.string()`** (or a documented open
  union), **never a closed `z.enum`** — its vocabulary is owned externally and may
  grow (a registry `status: mapped` not in the seeded enum would crash the parse at
  runtime; see SCHEMA-FROZEN-S1). Map the known set to UI display **at the component
  layer** with a neutral fallback for unknown values.
- **Validate before freezing**: when a contract projects an external source, sample
  live data first (read N real files, count the value distribution) — do not freeze
  a guessed vocabulary. `po-analyst` GATE0 + `architect-reviewer` enforce this.
- **Seam casing mirrors the external source 1:1** (snake_case for vault frontmatter)
  — no camelCase boundary for a pure projection; the shared zod schema is the only
  type source on both sides.
- **Shared UI display-maps** (status→badge variant, etc.) are declared **once,
  exported from their owning component**, and imported by consumers — never copied
  [LL-009].
