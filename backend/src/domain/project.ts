/**
 * Domain layer — pure frontmatter parser for vault project files (S1).
 *
 * No fs, no process.env, no external I/O. Unit-testable without mocks.
 * Receives the raw gray-matter data object; returns a validated ProjectSummary
 * or null when the record is too malformed to include in the registry.
 */
import { ProjectSummary } from "@kuraka-control/contracts";

/** Normalizes an empty string to null; passes through non-empty strings and null. */
function emptyToNull(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return null;
}

/**
 * Parses and normalizes gray-matter frontmatter data into a ProjectSummary.
 *
 * Returns null when:
 * - `raw` is not a plain object
 * - the required `name` field is missing or empty
 * - the zod parse fails after normalization
 *
 * Never throws — callers rely on null to signal a file-level skip.
 */
export function parseProjectFrontmatter(raw: unknown): ProjectSummary | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const data = raw as Record<string, unknown>;

  // Required field guard: skip files with no name
  if (!data["name"] || typeof data["name"] !== "string" || data["name"].trim() === "") {
    return null;
  }

  // Normalize "" → null on nullable fields before zod parse (per schema §3).
  const normalized: Record<string, unknown> = {
    ...data,
    repo_url: emptyToNull(data["repo_url"]),
    focus_scope: emptyToNull(data["focus_scope"]),
    last_mount: emptyToNull(data["last_mount"]),
    last_sync: emptyToNull(data["last_sync"]),
    // tags: absent → [] (zod handles coercion from undefined but we normalize here)
    tags: Array.isArray(data["tags"]) ? data["tags"] : [],
    // governance is always derived server-side, never read from frontmatter
    governance: "project" as const,
  };

  const result = ProjectSummary.safeParse(normalized);
  if (!result.success) {
    return null;
  }

  return result.data;
}
