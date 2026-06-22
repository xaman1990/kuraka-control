import { ProjectDetail } from "@kuraka-control/contracts";

/**
 * NotFoundError — thrown by fetchProjectDetail when the backend returns 404.
 * The detail page checks `instanceof NotFoundError` to render the not-found state
 * rather than a generic error panel.
 */
export class NotFoundError extends Error {
  readonly name: string = "NotFoundError";
  constructor(projectName: string) {
    super(`Project '${projectName}' is not registered in the vault`);
  }
}

/**
 * fetchProjectDetail — GET /api/projects/:name
 *
 * Parses the response with the shared zod schema (ProjectDetail).
 * On 404 throws NotFoundError so the caller can render a not-found state.
 * On other HTTP errors, extracts the ApiError envelope message if available.
 * Mirrors the fetch+zod-parse pattern from fetchProjects.
 */
export async function fetchProjectDetail(name: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);

  if (res.status === 404) {
    throw new NotFoundError(name);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? `Request failed with status ${res.status}`;
    const err = new Error(message) as Error & { code: string; detail: unknown };
    err.code = body?.error?.code ?? "UNKNOWN";
    err.detail = body?.error?.detail ?? null;
    throw err;
  }

  const json = await res.json();
  return ProjectDetail.parse(json);
}
