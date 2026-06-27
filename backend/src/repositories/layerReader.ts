/**
 * Repository — project layer filesystem adapter (S4).
 *
 * Provides:
 *   walkLayerTree  — recursive walk of <projectPath>/.claude/project/.
 *   readLayerFile  — safe contained file-read with the EXACT 6-step algorithm.
 *
 * The containment algorithm (readLayerFile) is SECURITY-CRITICAL and isolated
 * here so Phase 5.5 audits ONE file. It is an exact implementation of
 * SCHEMA-FROZEN-S4.md §3. Do NOT simplify or reorder steps.
 *
 * Security invariants (SEC1–SEC10 from SCHEMA-FROZEN-S4.md §3):
 *   SEC1: ".." traversal rejected before any fs touch (Step 1).
 *   SEC2: Absolute paths rejected before any fs touch — POSIX + Windows-drive (Step 1).
 *   SEC3: NUL byte rejected before any fs touch (Step 1).
 *   SEC4: Symlink escaping the root → FORBIDDEN (Steps 3–4, realpath on both sides).
 *   SEC5: No absolute server path in 403/404 bodies (route responsibility).
 *   SEC6: File never read when size > LAYER_FILE_MAX_BYTES (Step 6, stat-before-read).
 *   SEC7: Zero fs.writeFile / fs.mkdir / fs.rm / spawn / exec calls in this file.
 *   SEC8: fs.realpath called on BOTH root and candidate (Step 3).
 *   SEC9: realpath(root) failure → NOT_FOUND, never 500 (Step 3).
 *   SEC10: rel_path echoes the validated rel, never the resolved absolute path (Step 6).
 *
 * Convention: fs access is isolated here; services orchestrate; no writes, no spawns.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import type { LayerNodeShape, LayerFileResponse } from "@kuraka-control/contracts";

// ── Module-level named constants (FROZEN — no magic numbers) ──────────────────

/** Maximum file size for content preview (1 MiB). Larger files return too_large:true. */
export const LAYER_FILE_MAX_BYTES = 1_048_576;

/** Byte prefix scanned for NUL (0x00) to detect binary files. */
export const BINARY_SAMPLE_BYTES = 8192;

/** Maximum tree-walk depth. Exceeding this sets truncated:true. */
export const MAX_DEPTH = 8;

/** Maximum total nodes in tree walk. Exceeding this sets truncated:true. */
export const MAX_ENTRIES = 2000;

/** Constant rel path of the project layer root under a project directory. */
export const LAYER_ROOT_REL = ".claude/project";

// ── Sentinel union returned by readLayerFile (route maps to HTTP status) ─────

/** Route-level sentinels — not thrown, returned as discriminated values. */
export type LayerReadResult =
  | "BAD_REQUEST"    // → 400  (empty/missing rel)
  | "FORBIDDEN"      // → 403  (escape / non-regular-file)
  | "NOT_FOUND"      // → 404  (contained but no such file, or root unresolvable)
  | LayerFileResponse; // → 200

// ── Tree-walk result type ─────────────────────────────────────────────────────

export interface LayerTreeResult {
  has_layer: boolean;
  root_rel: string;
  nodes: LayerNodeShape[];
  empty: boolean;
  truncated: boolean;
}

// ── Internal walk state ───────────────────────────────────────────────────────

interface WalkState {
  count: number;
  truncated: boolean;
}

/**
 * Walks <projectPath>/.claude/project/ and returns a typed tree result.
 *
 * - has_layer is computed from a LIVE fs.stat of the layer dir (B2).
 * - Dirs-first then files, each group sorted alphabetically (B5).
 * - Dotfiles are included (B5).
 * - Symlinked directories are NOT followed; symlinked files appear as entries (B7).
 * - Walk is bounded by MAX_DEPTH and MAX_ENTRIES (B6).
 * - Never throws — absent dir / missing project path degrades gracefully (B3/B4).
 */
export async function walkLayerTree(projectPath: string): Promise<LayerTreeResult> {
  const layerRoot = path.resolve(projectPath, LAYER_ROOT_REL);
  const absent: LayerTreeResult = {
    has_layer: false,
    root_rel: LAYER_ROOT_REL,
    nodes: [],
    empty: true,
    truncated: false,
  };

  // Live stat — NEVER the registry has_project_layer flag (B2).
  let dirStat;
  try {
    dirStat = await fs.stat(layerRoot);
  } catch {
    return absent;
  }
  if (!dirStat.isDirectory()) {
    return absent;
  }

  const state: WalkState = { count: 0, truncated: false };
  const nodes = await _walkDir(layerRoot, "", 0, state);

  return {
    has_layer: true,
    root_rel: LAYER_ROOT_REL,
    nodes,
    empty: nodes.length === 0,
    truncated: state.truncated,
  };
}

/**
 * Recursive walk helper. Returns an array of LayerNodeShape for entries
 * in the given directory. Mutates `state` to track global count and truncation.
 *
 * @param absDir  - Absolute path of the directory to read.
 * @param relDir  - POSIX-relative path from the layer root (empty string for root).
 * @param depth   - Current recursion depth (0-based).
 * @param state   - Shared mutable walk state.
 */
async function _walkDir(
  absDir: string,
  relDir: string,
  depth: number,
  state: WalkState,
): Promise<LayerNodeShape[]> {
  if (depth >= MAX_DEPTH || state.truncated) {
    state.truncated = true;
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Classify entries explicitly so each dirent lands in exactly ONE group.
  //
  // On Node 22 a symlink dirent returns isSymbolicLink()===true but BOTH
  // isFile()===false AND isDirectory()===false, so the old two-predicate
  // approach matched every symlink in BOTH groups (double-emit, double-count).
  //
  // Fix: for symlinks we call fs.stat (follows the link) to resolve the
  // target type, then place the entry in dirs or files accordingly.
  // Dangling/unreadable symlinks (stat throws) are classified as files with
  // size_bytes:null — they appear in the tree as broken-link file nodes so
  // the user can see them. Real dirs and real files use their dirent flags
  // directly; no stat call needed for the non-symlink case.
  //
  // Symlinked dirs are NOT descended (B7 — no-follow prevents symlink loops).
  const dirs: (typeof entries[number])[] = [];
  const files: (typeof entries[number])[] = [];
  const symlinkStats = new Map<string, { isDir: boolean; size: number | null }>();

  for (const e of entries) {
    if (e.isDirectory()) {
      dirs.push(e);
    } else if (e.isFile()) {
      files.push(e);
    } else if (e.isSymbolicLink()) {
      // Resolve once; result is cached in symlinkStats for the processing loops.
      const absChild = path.join(absDir, e.name);
      try {
        const linkStat = await fs.stat(absChild); // follows the link
        if (linkStat.isDirectory()) {
          dirs.push(e);
          symlinkStats.set(e.name, { isDir: true, size: null });
        } else {
          files.push(e);
          symlinkStats.set(e.name, { isDir: false, size: linkStat.size });
        }
      } catch {
        // Dangling symlink or EACCES — classify as a file node with no size.
        files.push(e);
        symlinkStats.set(e.name, { isDir: false, size: null });
      }
    }
    // Entries that are none of the above (FIFO, socket, device) are silently
    // skipped — they have no meaningful representation in the layer tree.
  }

  // Sort each group alphabetically by name (B5).
  const sortByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name);
  dirs.sort(sortByName);
  files.sort(sortByName);

  const result: LayerNodeShape[] = [];

  // Process directories first (B5).
  for (const dirent of dirs) {
    if (state.truncated) break;
    if (state.count >= MAX_ENTRIES) {
      state.truncated = true;
      break;
    }

    // Symlinked directories are NOT followed — appear as a leaf dir node (B7).
    if (dirent.isSymbolicLink()) {
      state.count++;
      const relPath = _posixJoin(relDir, dirent.name);
      result.push({
        name: dirent.name,
        type: "dir",
        rel_path: relPath,
        size_bytes: null,
        children: [],
      });
      continue;
    }

    state.count++;
    const relPath = _posixJoin(relDir, dirent.name);
    const absPath = path.join(absDir, dirent.name);
    const children = await _walkDir(absPath, relPath, depth + 1, state);
    result.push({
      name: dirent.name,
      type: "dir",
      rel_path: relPath,
      size_bytes: null,
      children,
    });
  }

  // Process files (B5, B8).
  for (const dirent of files) {
    if (state.truncated) break;
    if (state.count >= MAX_ENTRIES) {
      state.truncated = true;
      break;
    }

    state.count++;
    const relPath = _posixJoin(relDir, dirent.name);
    const absPath = path.join(absDir, dirent.name);

    // For symlinks, use the size already resolved via fs.stat (follows the link)
    // during classification above. For real files, stat now to get the size.
    // fs.stat follows symlinks, giving the real target size — the right value
    // for the user; the exact size will be re-checked on read via the
    // containment algorithm (Step 6, LAYER_FILE_MAX_BYTES).
    let size_bytes: number | null = null;
    const cached = symlinkStats.get(dirent.name);
    if (cached !== undefined) {
      // Symlink: size already resolved (may be null for dangling links).
      size_bytes = cached.size;
    } else {
      try {
        const fileStat = await fs.stat(absPath);
        size_bytes = fileStat.size;
      } catch {
        // Unreadable stat → include the node with size_bytes:null (degrade, don't skip)
      }
    }

    result.push({
      name: dirent.name,
      type: "file",
      rel_path: relPath,
      size_bytes,
    });
  }

  return result;
}

/**
 * Joins path segments using POSIX separators (for rel_path values).
 * When the first segment is empty (layer root level), returns the name directly.
 */
function _posixJoin(relDir: string, name: string): string {
  return relDir === "" ? name : `${relDir}/${name}`;
}

/**
 * Reads a file under <projectPath>/.claude/project/ using the EXACT frozen
 * 6-step containment algorithm (SCHEMA-FROZEN-S4.md §3).
 *
 * @param projectPath  - Trusted registry project.path (never the request :name).
 * @param rel          - Untrusted client-supplied relative path.
 * @returns            LayerReadResult sentinel or LayerFileResponse on success.
 *
 * Steps (ordering is load-bearing — do not reorder):
 *   Step 1: Pre-resolve rejections — no fs touch.
 *   Step 2: Resolve under the trusted layer root.
 *   Step 3: realpath BOTH sides (resolves symlinks).
 *   Step 4: Containment check (exact `+ path.sep` boundary).
 *   Step 5: Must be a regular file.
 *   Step 6: Caps + binary detection (stat-before-read).
 */
export async function readLayerFile(
  projectPath: string,
  rel: string,
): Promise<LayerReadResult> {
  // ── Step 1 — pre-resolve rejections (NO fs touch) ──────────────────────────
  if (rel === undefined || rel === null || (rel as string) === "") {
    return "BAD_REQUEST";
  }
  if (rel.includes("\0")) return "FORBIDDEN";          // NUL byte (SEC3)
  if (path.isAbsolute(rel)) return "FORBIDDEN";        // POSIX absolute /etc/… (SEC2)
  if (/^[A-Za-z]:[\\/]/.test(rel)) return "FORBIDDEN"; // Windows drive C:\… (SEC2)
                                                        // path.isAbsolute is FALSE on POSIX
                                                        // for Windows-drive paths, so an
                                                        // explicit guard is required.
  const normalized = path.normalize(rel);
  if (normalized.startsWith("..")) return "FORBIDDEN";              // ../x, .. (SEC1)
  if (normalized.split(path.sep).includes("..")) return "FORBIDDEN"; // any .. segment (SEC1)

  // ── Step 2 — resolve under the trusted layer root ──────────────────────────
  const root = path.resolve(projectPath, LAYER_ROOT_REL); // ".claude/project"
  const candidate = path.resolve(root, rel);

  // ── Step 3 — realpath BOTH sides (resolves symlinks) ───────────────────────
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = await fs.realpath(root); // (SEC8, SEC9)
  } catch {
    // Root itself unresolvable (project moved / no layer dir) → NOT_FOUND (SEC9).
    // The tree endpoint reports has_layer:false for the same condition.
    return "NOT_FOUND";
  }
  try {
    realTarget = await fs.realpath(candidate); // (SEC4, SEC8)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "NOT_FOUND"; // legit miss
    if (code === "EACCES") return "FORBIDDEN";                        // perm denied
    return "NOT_FOUND"; // any other realpath failure → treat as not-found, never 500
  }

  // ── Step 4 — containment check (EXACT boundary — the security seam) ────────
  // realRoot equality alone would let the ROOT DIR itself pass; Step 5 rejects
  // it (dir, not a file). The `+ path.sep` is REQUIRED so "/x/proj-evil" cannot
  // pass a naive startsWith("/x/proj"). Compare REALPATHS so a symlink whose
  // target escapes the root is caught here. (SEC4)
  if (
    realTarget !== realRoot &&
    !realTarget.startsWith(realRoot + path.sep)
  ) {
    return "FORBIDDEN";
  }

  // ── Step 5 — must be a regular file ────────────────────────────────────────
  const stat = await fs.stat(realTarget); // realTarget already exists (Step 3)
  if (!stat.isFile()) return "FORBIDDEN"; // dir / FIFO / socket / device

  // ── Step 6 — caps + binary (stat-before-read) ──────────────────────────────
  const size_bytes = stat.size;

  // SEC6: stat-before-read — file is NEVER read when size exceeds cap.
  if (size_bytes > LAYER_FILE_MAX_BYTES) {
    return {
      rel_path: rel,            // SEC10: validated rel, not realTarget
      name: path.basename(rel),
      content: null,
      size_bytes,
      truncated: false,
      too_large: true,
      binary: false,
    };
  }

  const buf = await fs.readFile(realTarget); // safe: size already within cap
  const sample = buf.subarray(0, BINARY_SAMPLE_BYTES);
  if (sample.includes(0x00)) {
    return {
      rel_path: rel,            // SEC10: validated rel, not realTarget
      name: path.basename(rel),
      content: null,
      size_bytes,
      truncated: false,
      too_large: false,
      binary: true,
    };
  }

  return {
    rel_path: rel,              // SEC10: validated rel, not realTarget
    name: path.basename(rel),
    content: buf.toString("utf8"),
    size_bytes,
    truncated: false,
    too_large: false,
    binary: false,
  };
}
