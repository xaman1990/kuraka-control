import { ProjectListResponse } from "@kuraka-control/contracts";

/**
 * fetchProjects — GET /api/projects
 *
 * Parses the response with the shared zod schema (ProjectListResponse).
 * On HTTP error, extracts the ApiError envelope message if available.
 * On vault-unreadable (500), throws with the code and detail path so the
 * ProjectsPage error state can render a user-friendly message.
 */
export async function fetchProjects(): Promise<ProjectListResponse> {
  const res = await fetch("/api/projects");

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
  return ProjectListResponse.parse(json);
}
