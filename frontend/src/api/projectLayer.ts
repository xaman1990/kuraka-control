import { LayerTreeResponse, LayerFileResponse } from "@kuraka-control/contracts";

/**
 * ForbiddenError — thrown by fetchLayerFile when the backend returns 403.
 * LayerPreview checks `instanceof ForbiddenError` to render the forbidden state.
 * Mirrors NotFoundError in projectDetail.ts.
 */
export class ForbiddenError extends Error {
  readonly name: string = "ForbiddenError";
  constructor(rel: string) {
    super(`Access forbidden for path: ${rel}`);
  }
}

/**
 * NotFoundError — thrown by fetchLayerFile when the backend returns 404.
 */
export class LayerNotFoundError extends Error {
  readonly name: string = "LayerNotFoundError";
  constructor(rel: string) {
    super(`Layer file not found: ${rel}`);
  }
}

/**
 * fetchLayerTree — GET /api/projects/:name/layer
 *
 * Parses with LayerTreeResponse (shared zod schema).
 * Always returns 200 even when has_layer is false — no error on absent layer.
 */
export async function fetchLayerTree(name: string): Promise<LayerTreeResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}/layer`);

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
  return LayerTreeResponse.parse(json);
}

/**
 * fetchLayerFile — GET /api/projects/:name/layer/file?path=<relPath>
 *
 * Parses with LayerFileResponse (shared zod schema).
 * Throws ForbiddenError on 403, LayerNotFoundError on 404.
 * Uses encodeURIComponent on the path query value (story requirement).
 */
export async function fetchLayerFile(
  name: string,
  relPath: string,
): Promise<LayerFileResponse> {
  const url = `/api/projects/${encodeURIComponent(name)}/layer/file?path=${encodeURIComponent(relPath)}`;
  const res = await fetch(url);

  if (res.status === 403) {
    throw new ForbiddenError(relPath);
  }

  if (res.status === 404) {
    throw new LayerNotFoundError(relPath);
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
  return LayerFileResponse.parse(json);
}
