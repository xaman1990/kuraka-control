/**
 * WriteFirewall — the ONLY module in the backend that may call
 * fs.writeFile, fs.rename, fs.mkdir, or fs.rm.
 *
 * All other modules read or shell out. (fs-and-vault-safety §1;
 * security-model "Write firewall"; adr-006.)
 *
 * S5b-1 exposes one public write function: writeTriageRecord.
 * S5b-2 will add framework_patch / project_patch class entries to the
 * WRITE_CLASSES allowlist table without changing the writeTriageRecord surface.
 *
 * Containment algorithm: SCHEMA-FROZEN-S5b-1 §2 (6-step, adversarial-reviewed).
 */
import fs from "node:fs/promises";
import path from "node:path";

// ── Public constants ─────────────────────────────────────────────────────────

/** Subdirectory name inside the vault root where triage records live (flat). */
export const TRIAGE_RECORD_DIR = "retro-triage" as const;

/**
 * Allowlist regex for triage record filenames.
 * Accepts: YYYY-MM-DD-<slug>.md where slug = lowercase a-z, 0-9, _, -
 * Rejects: _TEMPLATE.md, uppercase slugs, paths with separators, etc.
 */
export const TRIAGE_FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}-[a-z0-9_-]+\.md$/;

// ── Error types ──────────────────────────────────────────────────────────────

export type WriteFirewallCode = "PATH_FORBIDDEN" | "WRITE_FAILED";

export class WriteFirewallError extends Error {
  constructor(
    public readonly code: WriteFirewallCode,
    message: string,
  ) {
    super(message);
    this.name = "WriteFirewallError";
  }
}

// ── Data-driven allowlist (forward-compat for S5b-2) ────────────────────────

/**
 * Each write class entry declares:
 *  - id: human label used in error messages
 *  - filenameRegex: basename allowlist
 *
 * S5b-2 adds framework_patch / project_patch entries here without re-cutting
 * writeTriageRecord. The function is generic over any WRITE_CLASSES entry but
 * callers in S5b-1 only ever pass the triage_record class.
 */
interface WriteClass {
  id: string;
  filenameRegex: RegExp;
}

const WRITE_CLASSES: Record<string, WriteClass> = {
  triage_record: {
    id: "triage_record",
    filenameRegex: TRIAGE_FILENAME_REGEX,
  },
};

// ── Internal containment helpers ─────────────────────────────────────────────

/**
 * STEP 1 — pre-resolve filename guards (cheap string checks, BEFORE any fs call).
 * Throws WriteFirewallError(PATH_FORBIDDEN) if any guard fires.
 */
function assertFilenamePreResolveGuards(filename: string): void {
  if (filename.trim() === "") {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename is empty");
  }
  if (filename.includes("/") || filename.includes("\\")) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename contains path separator");
  }
  if (filename.includes("..")) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename contains parent traversal (..)");
  }
  if (filename.includes("\0")) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename contains NUL byte");
  }
  if (path.isAbsolute(filename)) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename is absolute path");
  }
  if (/^[a-zA-Z]:/.test(filename)) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename has Windows drive prefix");
  }
  if (path.basename(filename) !== filename) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename contains hidden separator");
  }
}

// ── Public write API ─────────────────────────────────────────────────────────

/**
 * The ONLY public write entry point in S5b-1.
 * Writes `content` atomically to <realDir>/<filename> after a 6-step
 * containment + filename validation (SCHEMA-FROZEN-S5b-1 §2).
 *
 * @param triageDirAbsPath absolute path to the vault's retro-triage dir.
 *   The caller MUST build this as `path.join(vaultRoot, TRIAGE_RECORD_DIR)`.
 *   No client-supplied value may flow into this argument.
 * @param filename basename only — must pass all containment guards.
 * @param content the full new file content (UTF-8).
 *
 * @throws WriteFirewallError("PATH_FORBIDDEN") on any containment/regex failure (NO write).
 * @throws WriteFirewallError("WRITE_FAILED") on any underlying fs failure.
 */
export async function writeTriageRecord(
  triageDirAbsPath: string,
  filename: string,
  content: string,
): Promise<void> {
  // STEP 1 — pre-resolve filename guards (before ANY fs call).
  assertFilenamePreResolveGuards(filename);

  // STEP 2 — filename regex (basename allowlist).
  const writeClass = WRITE_CLASSES["triage_record"];
  if (!writeClass || !writeClass.filenameRegex.test(filename)) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "filename not allowed by triage_record allowlist");
  }

  // STEP 3 — realpath the PARENT dir (resolves symlinks; the file may not exist yet).
  let realDir: string;
  try {
    realDir = await fs.realpath(triageDirAbsPath);
  } catch {
    throw new WriteFirewallError("PATH_FORBIDDEN", "triage dir unresolvable");
  }

  // STEP 4 — build candidate.
  const candidate = path.join(realDir, filename);

  // STEP 5 — parent-equality containment (findings live FLAT in retro-triage/).
  // Stricter than startsWith: requires the file's parent to EQUAL realDir exactly,
  // so a nested "retro-triage/sub/x.md" is refused.
  if (path.dirname(candidate) !== realDir) {
    throw new WriteFirewallError("PATH_FORBIDDEN", "path escapes triage dir");
  }

  // STEP 6 — atomic write (only after steps 1-5 all pass).
  const target = path.join(realDir, filename);  // === candidate
  const tmp = path.join(realDir, filename + ".tmp");  // same dir → same filesystem

  try {
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, target);
  } catch (err) {
    // Best-effort cleanup of the orphan tmp; ignore cleanup errors.
    try { await fs.rm(tmp, { force: true }); } catch { /* ignore */ }
    throw new WriteFirewallError(
      "WRITE_FAILED",
      `write failed: ${(err as Error).message}`,
    );
  }
}
