import {
  TriageListResponse,
  TriageActionResponse,
  TriageRouteRequest,
  TriageDeferRequest,
  TriageRejectRequest,
} from "@kuraka-control/contracts";
import type {
  TriageRouteRequest as TriageRouteRequestType,
  TriageDeferRequest as TriageDeferRequestType,
  TriageRejectRequest as TriageRejectRequestType,
  TriageActionResponse as TriageActionResponseType,
} from "@kuraka-control/contracts";

// ── Typed action error ─────────────────────────────────────────────────────────

export interface TriageActionError extends Error {
  code: string;
  detail: unknown;
}

function buildActionError(body: unknown, status: number): TriageActionError {
  const b = body as { error?: { message?: string; code?: string; detail?: unknown } } | null;
  const message = b?.error?.message ?? `Request failed with status ${status}`;
  const err = new Error(message) as TriageActionError;
  err.code = b?.error?.code ?? "UNKNOWN";
  err.detail = b?.error?.detail ?? null;
  return err;
}

async function extractErrorBody(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

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
    const body = await extractErrorBody(res);
    throw buildActionError(body, res.status);
  }

  const json = await res.json();
  return TriageListResponse.parse(json);
}

/**
 * routeFinding — POST /api/triage/:id/route
 *
 * Sets the routing column for a specific finding. `finding_id` is required.
 * Returns the freshly re-read TriageDoc (disk truth) on success.
 * Throws TriageActionError with code PATH_FORBIDDEN (403), NOT_FOUND (404),
 * BAD_REQUEST (400), or WRITE_FAILED (500) on failure.
 */
export async function routeFinding(
  id: string,
  body: TriageRouteRequestType,
): Promise<TriageActionResponseType> {
  const validated = TriageRouteRequest.parse(body);
  const res = await fetch(`/api/triage/${encodeURIComponent(id)}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const errBody = await extractErrorBody(res);
    throw buildActionError(errBody, res.status);
  }

  const json = await res.json();
  return TriageActionResponse.parse(json);
}

/**
 * deferTriage — POST /api/triage/:id/defer
 *
 * Defers a specific finding (body with finding_id) or the whole card (empty body).
 * Returns the freshly re-read TriageDoc on success.
 */
export async function deferTriage(
  id: string,
  body: TriageDeferRequestType = {},
): Promise<TriageActionResponseType> {
  const validated = TriageDeferRequest.parse(body);
  const res = await fetch(`/api/triage/${encodeURIComponent(id)}/defer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const errBody = await extractErrorBody(res);
    throw buildActionError(errBody, res.status);
  }

  const json = await res.json();
  return TriageActionResponse.parse(json);
}

/**
 * rejectTriage — POST /api/triage/:id/reject
 *
 * Rejects a specific finding (body with finding_id) or the whole card (empty body).
 * Returns the freshly re-read TriageDoc on success.
 */
export async function rejectTriage(
  id: string,
  body: TriageRejectRequestType = {},
): Promise<TriageActionResponseType> {
  const validated = TriageRejectRequest.parse(body);
  const res = await fetch(`/api/triage/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const errBody = await extractErrorBody(res);
    throw buildActionError(errBody, res.status);
  }

  const json = await res.json();
  return TriageActionResponse.parse(json);
}
