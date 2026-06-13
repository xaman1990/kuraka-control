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
