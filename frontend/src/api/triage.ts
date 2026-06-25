import { TriageListResponse } from "@kuraka-control/contracts";

/**
 * fetchTriage — GET /api/triage
 *
 * Parses the response with the shared zod schema (TriageListResponse).
 * On HTTP error, extracts the ApiError envelope message if available.
 * On vault-unreadable (500), throws with code and detail so TriagePage can
 * render a user-friendly error state.
 * Mirrors the fetch+zod-parse pattern from api/projects.ts.
 */
export async function fetchTriage(): Promise<TriageListResponse> {
  const res = await fetch("/api/triage");

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? `Request failed with status ${res.status}`;
    const detail = body?.error?.detail ?? null;
    const code = body?.error?.code ?? "UNKNOWN";
    const err = new Error(message) as Error & {
      code: string;
      detail: unknown;
    };
    err.code = code;
    err.detail = detail;
    throw err;
  }

  const json = await res.json();
  return TriageListResponse.parse(json);
}
