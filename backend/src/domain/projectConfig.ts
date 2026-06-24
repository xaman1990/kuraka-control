/**
 * Domain layer — pure ProjectConfig curation (S3).
 *
 * No fs, no process.env, no external I/O. Unit-testable without mocks.
 * Implements the FROZEN curation mapping from SCHEMA-FROZEN-S3.md §2.
 *
 * Rules (FROZEN):
 *   - String fields: only when typeof === "string"; otherwise null.
 *   - Number fields: only when typeof === "number"; do NOT coerce strings.
 *   - architecture_layers: Array.isArray → filter(string members) → string[];
 *     else []. Never null.
 *   - Unknown extra keys anywhere in raw are ignored (no strict schema on raw).
 *   - raw not a plain object → callers return null before invoking this fn.
 */
import type { ProjectConfig } from "@kuraka-control/contracts";

/**
 * Returns a string value when the candidate is a string, otherwise null.
 * Type-strict per the FROZEN mapping rules — no coercion.
 */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Returns a number value when the candidate is a number, otherwise null.
 * Type-strict per the FROZEN mapping rules — do NOT coerce "400" → 400.
 */
function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Curates a raw parsed yaml object into the canonical ProjectConfig shape.
 *
 * The caller MUST ensure `raw` is a plain object (not null / array / primitive).
 * When a section (stack, architecture, conventions, workflow) is absent or a
 * non-object, the corresponding fields default to null / [].
 *
 * Pure function: no side effects, no I/O, no exceptions.
 */
export function curateProjectConfig(raw: unknown): ProjectConfig {
  // Cast to Record for optional-chaining access; callers guarantee it is a plain object.
  const r = raw as Record<string, unknown>;

  const stack = (r["stack"] !== null && typeof r["stack"] === "object" && !Array.isArray(r["stack"]))
    ? (r["stack"] as Record<string, unknown>)
    : null;

  const backend = (stack !== null && stack["backend"] !== null && typeof stack["backend"] === "object" && !Array.isArray(stack["backend"]))
    ? (stack["backend"] as Record<string, unknown>)
    : null;

  const frontend = (stack !== null && stack["frontend"] !== null && typeof stack["frontend"] === "object" && !Array.isArray(stack["frontend"]))
    ? (stack["frontend"] as Record<string, unknown>)
    : null;

  const architecture = (r["architecture"] !== null && typeof r["architecture"] === "object" && !Array.isArray(r["architecture"]))
    ? (r["architecture"] as Record<string, unknown>)
    : null;

  const conventions = (r["conventions"] !== null && typeof r["conventions"] === "object" && !Array.isArray(r["conventions"]))
    ? (r["conventions"] as Record<string, unknown>)
    : null;

  const workflow = (r["workflow"] !== null && typeof r["workflow"] === "object" && !Array.isArray(r["workflow"]))
    ? (r["workflow"] as Record<string, unknown>)
    : null;

  // architecture.layers → filter string members; else []; never null.
  const rawLayers = architecture !== null ? architecture["layers"] : undefined;
  const architecture_layers: string[] = Array.isArray(rawLayers)
    ? rawLayers.filter((x): x is string => typeof x === "string")
    : [];

  return {
    backend_language: asString(backend?.["language"] ?? null),
    backend_framework: asString(backend?.["framework"] ?? null),
    frontend_language: asString(frontend?.["language"] ?? null),
    frontend_framework: asString(frontend?.["framework"] ?? null),
    architecture_layers,
    state_mgmt: asString(frontend?.["state_mgmt"] ?? null),
    naming_language: asString(conventions?.["naming_language"] ?? null),
    max_file_loc: asNumber(conventions?.["max_file_loc"] ?? null),
    max_function_loc: asNumber(conventions?.["max_function_loc"] ?? null),
    default_mode: asString(workflow?.["default_mode"] ?? null),
  };
}
