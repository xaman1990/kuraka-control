/**
 * Unit tests for layerReader repository (S4 — T1).
 *
 * Uses REAL temp dirs (node:fs/promises + os.tmpdir()) with real symlinks.
 * No mocks — all containment/traversal tests verify actual realpath behaviour.
 *
 * Coverage:
 *   readLayerFile — containment (security, exhaustive), caps, binary, empty, text.
 *   walkLayerTree — ordering, symlink handling, depth cap, entry cap, absent dir.
 *
 * SECURITY VECTORS (all from SCHEMA-FROZEN-S4.md §7):
 *   SEC1: .. traversal in multiple positions → FORBIDDEN (before any fs touch)
 *   SEC2: Absolute POSIX path → FORBIDDEN; Windows drive path → FORBIDDEN
 *   SEC3: NUL byte in rel → FORBIDDEN (before any fs touch)
 *   SEC4: Symlink whose realpath escapes the layer root → FORBIDDEN
 *   SEC6: File > LAYER_FILE_MAX_BYTES never read into memory
 *   SEC9: realpath(root) failure → NOT_FOUND, never 500
 *  SEC10: rel_path echoes the validated rel, never the resolved absolute path
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readLayerFile,
  walkLayerTree,
  LAYER_FILE_MAX_BYTES,
  BINARY_SAMPLE_BYTES,
  MAX_DEPTH,
  MAX_ENTRIES,
  LAYER_ROOT_REL,
} from "./layerReader.js";

// ---------------------------------------------------------------------------
// Temp dir lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  // tempDir will act as the projectPath; the layer root is tempDir/.claude/project
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-layerreader-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensures tempDir/.claude/project/ exists and returns its absolute path. */
async function _makeLayerRoot(): Promise<string> {
  const layerRoot = path.join(tempDir, ".claude", "project");
  await fs.mkdir(layerRoot, { recursive: true });
  return layerRoot;
}

/** Writes a UTF-8 text file at rel path under the layer root. */
async function _writeLayerFile(relPath: string, content: string): Promise<string> {
  const layerRoot = path.join(tempDir, ".claude", "project");
  await fs.mkdir(layerRoot, { recursive: true });
  const abs = path.join(layerRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
  return abs;
}

/** Writes a file with the given Buffer content at rel path under the layer root. */
async function _writeLayerFileBuf(relPath: string, buf: Buffer): Promise<string> {
  const layerRoot = path.join(tempDir, ".claude", "project");
  await fs.mkdir(layerRoot, { recursive: true });
  const abs = path.join(layerRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return abs;
}

// ===========================================================================
// readLayerFile — CONTAINMENT (security core, exhaustive)
// ===========================================================================

// ---------------------------------------------------------------------------
// SEC1 — .. traversal (pre-resolve, no fs touch)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: basic .. traversal → FORBIDDEN (SEC1)", () => {
  it("should return FORBIDDEN for rel '../../../../etc/passwd'", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "../../../../etc/passwd");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for rel 'a/../../etc/passwd'", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "a/../../etc/passwd");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for rel '../' (single parent jump)", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "../");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for rel '..' (bare parent reference)", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "..");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for rel '....//etc/passwd' (four-dot obfuscation)", async () => {
    // Arrange — '....//etc/passwd' normalizes via path.normalize to '..../etc/passwd'
    // which startsWith('..') because the four-dot segment begins with two dots.
    // The frozen SEC1 check uses startsWith('..') on the normalized path, which
    // conservatively rejects this (the alternative would require inspecting all
    // segments, but '....' starts with the two-dot prefix).
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "....//etc/passwd");

    // Assert — '..../etc/passwd' startsWith('..') is true on Node/macOS,
    // so Step 1 returns FORBIDDEN (conservative but correct — safe side).
    expect(result).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// SEC2 — Absolute paths (pre-resolve, no fs touch)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: absolute paths → FORBIDDEN (SEC2)", () => {
  it("should return FORBIDDEN for a POSIX absolute path '/etc/passwd'", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "/etc/passwd");

    // Assert — path.isAbsolute catches this in Step 1
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for a Windows drive path 'C:\\Windows\\win.ini'", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act — on POSIX, path.isAbsolute returns false for Windows drive paths;
    // an explicit regex guard is required (SEC2 in the frozen algorithm)
    const result = await readLayerFile(tempDir, "C:\\Windows\\win.ini");

    // Assert — the Windows-drive regex guard in Step 1 must catch this
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for 'C:/Windows/win.ini' (forward-slash Windows drive)", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "C:/Windows/win.ini");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for 'Z:\\\\deep\\\\path'", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "Z:\\\\deep\\\\path");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// SEC3 — NUL byte in rel (pre-resolve, no fs touch)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: NUL byte in rel → FORBIDDEN (SEC3)", () => {
  it("should return FORBIDDEN when rel contains a NUL byte", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "valid/path\0/etc/passwd");

    // Assert — rel.includes('\0') check in Step 1 must catch this before any fs touch
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN when rel is just a NUL byte", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "\0");

    // Assert
    expect(result).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// BAD_REQUEST — empty rel (pre-resolve, no fs touch)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: empty rel → BAD_REQUEST", () => {
  it("should return BAD_REQUEST for an empty string rel", async () => {
    // Arrange
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "");

    // Assert — Step 1 checks rel === "" before any fs touch
    expect(result).toBe("BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// FORBIDDEN — rel resolves to root dir (not a file)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: rel '.' resolves to root dir → FORBIDDEN", () => {
  it("should return FORBIDDEN when rel is '.' (resolves to the layer root directory)", async () => {
    // Arrange — the layer root exists but '.' resolves to a directory, not a file
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, ".");

    // Assert — Step 5 (must be a regular file) catches this even after containment passes
    expect(result).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// FORBIDDEN — rel is a path to a real subdirectory (not a file)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: rel resolves to a subdirectory → FORBIDDEN", () => {
  it("should return FORBIDDEN when rel points to a real subdirectory inside the layer", async () => {
    // Arrange — create a subdirectory inside the layer root
    const layerRoot = await _makeLayerRoot();
    const subdir = path.join(layerRoot, "conventions");
    await fs.mkdir(subdir);

    // Act — 'conventions' resolves to a directory, not a file
    const result = await readLayerFile(tempDir, "conventions");

    // Assert — Step 5 (must be a regular file) catches dirs after containment passes
    expect(result).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// NOT_FOUND — valid contained rel but file does not exist
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: valid contained rel, file absent → NOT_FOUND", () => {
  it("should return NOT_FOUND for a rel that is valid and contained but file does not exist", async () => {
    // Arrange — layer root exists but the specific file does not
    await _makeLayerRoot();

    // Act
    const result = await readLayerFile(tempDir, "conventions/nonexistent.md");

    // Assert — realpath of candidate throws ENOENT in Step 3 → NOT_FOUND
    expect(result).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// NOT_FOUND — layer root itself unresolvable (SEC9)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: layer root unresolvable → NOT_FOUND (SEC9)", () => {
  it("should return NOT_FOUND (not crash) when the layer root directory does not exist", async () => {
    // Arrange — tempDir exists but has NO .claude/project/ subdirectory
    // (do not call _makeLayerRoot)

    // Act
    const result = await readLayerFile(tempDir, "conventions/typescript.md");

    // Assert — realpath(root) throws ENOENT in Step 3 → NOT_FOUND, never 500/FORBIDDEN
    expect(result).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// SEC4 — Symlink whose realpath escapes the layer root → FORBIDDEN (HEADLINE)
// ---------------------------------------------------------------------------

describe("readLayerFile — containment: symlink escaping layer root → FORBIDDEN (SEC4)", () => {
  it("should return FORBIDDEN when a symlink inside the layer root points to /etc/passwd", async () => {
    // Arrange — create a real symlink inside the layer root that targets /etc/passwd
    const layerRoot = await _makeLayerRoot();
    const symlinkPath = path.join(layerRoot, "escape-link");
    try {
      await fs.symlink("/etc/passwd", symlinkPath);
    } catch {
      // /etc/passwd may not exist in CI; create a temp escape target instead
      const escapeTarget = await fs.mkdtemp(path.join(os.tmpdir(), "escape-"));
      const escapeFile = path.join(escapeTarget, "secret.txt");
      await fs.writeFile(escapeFile, "secret content", "utf-8");
      await fs.symlink(escapeFile, symlinkPath);
    }

    // Act — request the symlink via its layer-relative name
    const result = await readLayerFile(tempDir, "escape-link");

    // Assert — realpath resolves the symlink target, Step 4 containment check
    // sees realTarget outside realRoot + path.sep, returns FORBIDDEN
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN when a symlink points to a file in a sibling directory outside the layer", async () => {
    // Arrange — create the layer root and a sibling temp dir with a secret file
    const layerRoot = await _makeLayerRoot();
    const siblingDir = await fs.mkdtemp(path.join(os.tmpdir(), "sibling-secret-"));
    const secretFile = path.join(siblingDir, "secret.txt");
    await fs.writeFile(secretFile, "should not be readable via symlink", "utf-8");

    // Create a symlink inside the layer root pointing to the sibling file
    const symlinkPath = path.join(layerRoot, "sibling-link");
    await fs.symlink(secretFile, symlinkPath);

    // Act
    const result = await readLayerFile(tempDir, "sibling-link");

    // Assert — symlink target is outside the layer root → FORBIDDEN
    expect(result).toBe("FORBIDDEN");

    // Cleanup
    await fs.rm(siblingDir, { recursive: true, force: true });
  });

  it("should NOT return the content of a file that a symlink points to outside the root", async () => {
    // Arrange — create a real file outside the layer root and a symlink to it
    const layerRoot = await _makeLayerRoot();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
    const outsideFile = path.join(outsideDir, "outside.txt");
    await fs.writeFile(outsideFile, "outside content — must never be returned", "utf-8");
    const symlinkPath = path.join(layerRoot, "outside-link");
    await fs.symlink(outsideFile, symlinkPath);

    // Act
    const result = await readLayerFile(tempDir, "outside-link");

    // Assert — content is NEVER returned; result is FORBIDDEN (never a LayerFileResponse)
    expect(result).toBe("FORBIDDEN");
    expect(typeof result).toBe("string"); // string sentinel, not an object

    // Cleanup
    await fs.rm(outsideDir, { recursive: true, force: true });
  });
});

// ===========================================================================
// readLayerFile — Happy path (text file)
// ===========================================================================

describe("readLayerFile — happy path: valid text file", () => {
  it("should return the UTF-8 content of a valid contained text file", async () => {
    // Arrange
    const content = "# TypeScript conventions\nUse strict mode.\n";
    await _writeLayerFile("conventions/typescript.md", content);

    // Act
    const result = await readLayerFile(tempDir, "conventions/typescript.md");

    // Assert
    expect(result).not.toBe("BAD_REQUEST");
    expect(result).not.toBe("FORBIDDEN");
    expect(result).not.toBe("NOT_FOUND");
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.content).toBe(content);
      expect(result.binary).toBe(false);
      expect(result.too_large).toBe(false);
      expect(result.truncated).toBe(false);
    }
  });

  it("should echo the validated rel (not the resolved absolute path) in rel_path (SEC10)", async () => {
    // Arrange
    const content = "# test";
    const rel = "conventions/typescript.md";
    await _writeLayerFile(rel, content);

    // Act
    const result = await readLayerFile(tempDir, rel);

    // Assert — SEC10: rel_path must be the validated rel, never an abs path
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.rel_path).toBe(rel);
      expect(result.rel_path).not.toContain(os.tmpdir());
      expect(path.isAbsolute(result.rel_path)).toBe(false);
    }
  });

  it("should return the correct name (basename) for a nested file", async () => {
    // Arrange
    await _writeLayerFile("conventions/typescript.md", "# TS");

    // Act
    const result = await readLayerFile(tempDir, "conventions/typescript.md");

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.name).toBe("typescript.md");
    }
  });

  it("should return size_bytes matching the actual file size on disk", async () => {
    // Arrange
    const content = "exactly 30 chars of content!!";
    await _writeLayerFile("size-test.md", content);
    const expectedSize = Buffer.byteLength(content, "utf-8");

    // Act
    const result = await readLayerFile(tempDir, "size-test.md");

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.size_bytes).toBe(expectedSize);
    }
  });
});

// ===========================================================================
// readLayerFile — Caps: too_large (SEC6)
// ===========================================================================

describe("readLayerFile — cap: file exceeds LAYER_FILE_MAX_BYTES → too_large:true (SEC6)", () => {
  it("should return too_large:true and content:null for a file larger than LAYER_FILE_MAX_BYTES", async () => {
    // Arrange — create a file slightly over the 1 MiB cap WITHOUT reading the whole
    // thing into memory during test setup (write in a streaming/efficient way)
    const layerRoot = await _makeLayerRoot();
    const bigFilePath = path.join(layerRoot, "big.bin");
    const overCapSize = LAYER_FILE_MAX_BYTES + 1; // 1 MiB + 1 byte

    // Write the file in a 1-byte-over-cap pattern using a Buffer of that exact size
    const handle = await fs.open(bigFilePath, "w");
    const buf = Buffer.alloc(overCapSize, 0x41); // fill with 'A'
    await handle.write(buf, 0, overCapSize, 0);
    await handle.close();

    // Act
    const result = await readLayerFile(tempDir, "big.bin");

    // Assert — stat-before-read: file is NEVER read into memory (SEC6)
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.too_large).toBe(true);
      expect(result.content).toBeNull();
      expect(result.binary).toBe(false); // binary is false when too_large (biconditional)
      expect(result.size_bytes).toBe(overCapSize);
    }
  });

  it("should NOT read file content into memory when too_large — content must be null", async () => {
    // Arrange — this test verifies the stat-before-read invariant by checking
    // the response object fields (content:null is the observable proof)
    const layerRoot = await _makeLayerRoot();
    const bigFilePath = path.join(layerRoot, "huge.bin");
    const overCapSize = LAYER_FILE_MAX_BYTES + 100;

    const handle = await fs.open(bigFilePath, "w");
    const buf = Buffer.alloc(overCapSize, 0x42);
    await handle.write(buf, 0, overCapSize, 0);
    await handle.close();

    // Act
    const result = await readLayerFile(tempDir, "huge.bin");

    // Assert — content must be null; if this were wrong the call itself
    // would allocate >1 MiB (observable via process.memoryUsage in perf tests,
    // but the null check is the contractual assertion)
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.content).toBeNull();
      expect(result.too_large).toBe(true);
    }
  });

  it("should return the actual size_bytes even when the file is too large", async () => {
    // Arrange
    const layerRoot = await _makeLayerRoot();
    const bigFilePath = path.join(layerRoot, "exact-cap.bin");
    const overCapSize = LAYER_FILE_MAX_BYTES + 512;

    const handle = await fs.open(bigFilePath, "w");
    const buf = Buffer.alloc(overCapSize, 0x43);
    await handle.write(buf, 0, overCapSize, 0);
    await handle.close();

    // Act
    const result = await readLayerFile(tempDir, "exact-cap.bin");

    // Assert — size_bytes is the real disk size, not capped
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.size_bytes).toBe(overCapSize);
    }
  });

  it("should return a file exactly at the cap (LAYER_FILE_MAX_BYTES) as readable (not too_large)", async () => {
    // Arrange — a file of exactly LAYER_FILE_MAX_BYTES (boundary: not over cap)
    const layerRoot = await _makeLayerRoot();
    const exactCapPath = path.join(layerRoot, "exact.bin");
    const buf = Buffer.alloc(LAYER_FILE_MAX_BYTES, 0x41); // fill with 'A' — no NUL bytes

    const handle = await fs.open(exactCapPath, "w");
    await handle.write(buf, 0, LAYER_FILE_MAX_BYTES, 0);
    await handle.close();

    // Act
    const result = await readLayerFile(tempDir, "exact.bin");

    // Assert — exactly at cap is readable (condition is size > cap, not >=)
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.too_large).toBe(false);
      expect(result.content).not.toBeNull();
    }
  });
});

// ===========================================================================
// readLayerFile — Caps: binary detection
// ===========================================================================

describe("readLayerFile — cap: binary file (NUL in first BINARY_SAMPLE_BYTES) → binary:true", () => {
  it("should return binary:true and content:null when file contains a NUL byte in the first 8192 bytes", async () => {
    // Arrange — a file within size cap but with a NUL byte in the first 8 KiB
    const buf = Buffer.alloc(100, 0x41);
    buf[50] = 0x00; // NUL byte at position 50
    await _writeLayerFileBuf("binary.bin", buf);

    // Act
    const result = await readLayerFile(tempDir, "binary.bin");

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.binary).toBe(true);
      expect(result.content).toBeNull();
      expect(result.too_large).toBe(false); // binary implies NOT too_large (biconditional)
    }
  });

  it("should return binary:true when NUL byte is exactly at position BINARY_SAMPLE_BYTES - 1", async () => {
    // Arrange — NUL at the last byte of the sample window
    const buf = Buffer.alloc(BINARY_SAMPLE_BYTES + 100, 0x41);
    buf[BINARY_SAMPLE_BYTES - 1] = 0x00; // last byte of sample window
    await _writeLayerFileBuf("boundary-binary.bin", buf);

    // Act
    const result = await readLayerFile(tempDir, "boundary-binary.bin");

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.binary).toBe(true);
      expect(result.content).toBeNull();
    }
  });

  it("should return binary:false when NUL byte is ONLY at position BINARY_SAMPLE_BYTES (after the sample window)", async () => {
    // Arrange — NUL is outside the sample window; file appears text within the sample
    const buf = Buffer.alloc(BINARY_SAMPLE_BYTES + 10, 0x41);
    buf[BINARY_SAMPLE_BYTES] = 0x00; // one position past the sample window
    await _writeLayerFileBuf("text-with-late-nul.bin", buf);

    // Act
    const result = await readLayerFile(tempDir, "text-with-late-nul.bin");

    // Assert — NUL is past the sample window → classified as text
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.binary).toBe(false);
      expect(result.content).not.toBeNull();
    }
  });
});

// ===========================================================================
// readLayerFile — Empty file
// ===========================================================================

describe("readLayerFile — empty file: content is empty string (not an error)", () => {
  it("should return content:'' and binary:false for an empty file (.gitkeep precedent)", async () => {
    // Arrange — empty file (0 bytes)
    await _writeLayerFile(".gitkeep", "");

    // Act
    const result = await readLayerFile(tempDir, ".gitkeep");

    // Assert — empty file is NOT an error (SCHEMA-FROZEN-S4.md §1 biconditionals)
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.content).toBe("");
      expect(result.binary).toBe(false);
      expect(result.too_large).toBe(false);
      expect(result.size_bytes).toBe(0);
    }
  });
});

// ===========================================================================
// walkLayerTree — Ordering (dirs-first then files, sorted alphabetically)
// ===========================================================================

describe("walkLayerTree — ordering: dirs-first then files, sorted alphabetically", () => {
  it("should list directories before files at the same level", async () => {
    // Arrange — create a mix of files and dirs at the layer root
    const layerRoot = await _makeLayerRoot();
    await fs.mkdir(path.join(layerRoot, "zzz-dir"));
    await fs.mkdir(path.join(layerRoot, "aaa-dir"));
    await fs.writeFile(path.join(layerRoot, "mmm-file.md"), "# file");
    await fs.writeFile(path.join(layerRoot, "aaa-file.md"), "# file");

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert — dirs come first, then files, each group sorted alphabetically
    expect(result.has_layer).toBe(true);
    const names = result.nodes.map((n) => n.name);
    // aaa-dir and zzz-dir must appear before any file
    const firstFileIdx = names.findIndex((n) => n.endsWith("-file.md"));
    const lastDirIdx = Math.max(
      names.findIndex((n) => n === "aaa-dir"),
      names.findIndex((n) => n === "zzz-dir"),
    );
    expect(lastDirIdx).toBeLessThan(firstFileIdx);
  });

  it("should sort directories alphabetically within their group", async () => {
    // Arrange
    const layerRoot = await _makeLayerRoot();
    await fs.mkdir(path.join(layerRoot, "zzz-dir"));
    await fs.mkdir(path.join(layerRoot, "aaa-dir"));
    await fs.mkdir(path.join(layerRoot, "mmm-dir"));

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    const dirNames = result.nodes.filter((n) => n.type === "dir").map((n) => n.name);
    expect(dirNames).toEqual([...dirNames].sort());
  });

  it("should sort files alphabetically within their group", async () => {
    // Arrange
    const layerRoot = await _makeLayerRoot();
    await fs.writeFile(path.join(layerRoot, "zzz.md"), "z");
    await fs.writeFile(path.join(layerRoot, "aaa.md"), "a");
    await fs.writeFile(path.join(layerRoot, "mmm.md"), "m");

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    const fileNames = result.nodes.filter((n) => n.type === "file").map((n) => n.name);
    expect(fileNames).toEqual([...fileNames].sort());
  });

  it("should include dotfiles (.gitkeep) in the listing", async () => {
    // Arrange — dotfiles must be visible (B5)
    const layerRoot = await _makeLayerRoot();
    await fs.writeFile(path.join(layerRoot, ".gitkeep"), "");

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain(".gitkeep");
  });
});

// ===========================================================================
// walkLayerTree — Symlink handling (the Phase-5 BLOCKER fix)
// ===========================================================================

describe("walkLayerTree — symlinks classified EXACTLY ONCE and in the right group", () => {
  it("should list a symlink-to-file as a file node exactly once (not duplicated)", async () => {
    // Arrange — create a real file and a symlink to it inside the layer root
    const layerRoot = await _makeLayerRoot();
    const realFile = path.join(layerRoot, "real.md");
    await fs.writeFile(realFile, "# real file");
    const symlinkFile = path.join(layerRoot, "link-to-file.md");
    await fs.symlink(realFile, symlinkFile);

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert — the symlink must appear as a file node exactly once
    const fileNodes = result.nodes.filter((n) => n.type === "file");
    const linkNodes = fileNodes.filter((n) => n.name === "link-to-file.md");
    expect(linkNodes).toHaveLength(1);
    // Must NOT also appear as a dir node
    const asDirNode = result.nodes.filter(
      (n) => n.type === "dir" && n.name === "link-to-file.md",
    );
    expect(asDirNode).toHaveLength(0);
  });

  it("should list a symlink-to-dir as a dir node exactly once and NOT descend into it", async () => {
    // Arrange — create a real dir (outside the layer root) and a symlink to it
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "outside-target-"));
    await fs.writeFile(path.join(outsideDir, "child.md"), "# child");

    const layerRoot = await _makeLayerRoot();
    const symlinkDir = path.join(layerRoot, "link-to-dir");
    await fs.symlink(outsideDir, symlinkDir);

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert — appears exactly once as a dir node
    const dirNodes = result.nodes.filter((n) => n.type === "dir");
    const linkDirNodes = dirNodes.filter((n) => n.name === "link-to-dir");
    expect(linkDirNodes).toHaveLength(1);

    // Must NOT be duplicated as a file node
    const asFileNode = result.nodes.filter(
      (n) => n.type === "file" && n.name === "link-to-dir",
    );
    expect(asFileNode).toHaveLength(0);

    // Must NOT descend into the symlinked dir (children must be empty, B7)
    const linkNode = linkDirNodes[0];
    expect(linkNode).toBeDefined();
    if (linkNode) {
      expect(linkNode.children).toBeDefined();
      expect(linkNode.children).toHaveLength(0); // not followed, so no children
    }

    // Cleanup
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("should not double-count any symlink entry in the total node list", async () => {
    // Arrange — a mix of symlink-to-file and symlink-to-dir at the layer root
    const layerRoot = await _makeLayerRoot();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "sym-target-dir-"));
    const realFile = path.join(layerRoot, "real.md");
    await fs.writeFile(realFile, "# real");
    const symlinkFile = path.join(layerRoot, "sym-file.md");
    await fs.symlink(realFile, symlinkFile);
    const symlinkDir = path.join(layerRoot, "sym-dir");
    await fs.symlink(outsideDir, symlinkDir);

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert — total entries must equal the number of unique names at this level
    const allNames = result.nodes.map((n) => n.name);
    const uniqueNames = new Set(allNames);
    // Each name must appear exactly once
    expect(allNames.length).toBe(uniqueNames.size);

    // Cleanup
    await fs.rm(outsideDir, { recursive: true, force: true });
  });
});

// ===========================================================================
// walkLayerTree — Depth cap → truncated:true
// ===========================================================================

describe("walkLayerTree — depth cap: MAX_DEPTH exceeded → truncated:true", () => {
  it("should set truncated:true and return a partial tree when nesting exceeds MAX_DEPTH", async () => {
    // Arrange — build a chain of nested dirs deeper than MAX_DEPTH
    const layerRoot = await _makeLayerRoot();
    let current = layerRoot;
    // Create MAX_DEPTH + 2 levels of nesting (to ensure the cap fires)
    for (let i = 0; i < MAX_DEPTH + 2; i++) {
      current = path.join(current, `depth-${i}`);
      await fs.mkdir(current);
    }
    // Put a file at the deepest level (it will not appear due to the cap)
    await fs.writeFile(path.join(current, "deep.md"), "# deep");

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    expect(result.has_layer).toBe(true);
    expect(result.truncated).toBe(true);
  });
});

// ===========================================================================
// walkLayerTree — Entry cap → truncated:true
// ===========================================================================

describe("walkLayerTree — entry cap: MAX_ENTRIES exceeded → truncated:true", () => {
  it("should set truncated:true when total file count exceeds MAX_ENTRIES", async () => {
    // Arrange — create MAX_ENTRIES + 10 files at the layer root
    const layerRoot = await _makeLayerRoot();
    const total = MAX_ENTRIES + 10;
    // Write in parallel batches of 50 to avoid hitting fs limits
    const batchSize = 50;
    for (let batch = 0; batch < Math.ceil(total / batchSize); batch++) {
      const writes: Promise<void>[] = [];
      for (let i = 0; i < batchSize && batch * batchSize + i < total; i++) {
        const idx = batch * batchSize + i;
        writes.push(
          fs.writeFile(path.join(layerRoot, `file-${String(idx).padStart(5, "0")}.md`), "# f"),
        );
      }
      await Promise.all(writes);
    }

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    expect(result.has_layer).toBe(true);
    expect(result.truncated).toBe(true);
  });
});

// ===========================================================================
// walkLayerTree — Absent layer dir → has_layer:false
// ===========================================================================

describe("walkLayerTree — absent .claude/project/ dir → has_layer:false", () => {
  it("should return has_layer:false when .claude/project/ does not exist under projectPath", async () => {
    // Arrange — tempDir exists but has no .claude/project/ subdirectory

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert
    expect(result.has_layer).toBe(false);
    expect(result.nodes).toEqual([]);
    expect(result.empty).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.root_rel).toBe(LAYER_ROOT_REL);
  });

  it("should return has_layer:false when the project path itself does not exist on disk", async () => {
    // Arrange — use a non-existent project path
    const nonExistentPath = path.join(os.tmpdir(), "kuraka-nonexistent-" + Date.now());

    // Act
    const result = await walkLayerTree(nonExistentPath);

    // Assert — degrades gracefully, never throws (B4)
    expect(result.has_layer).toBe(false);
    expect(result.nodes).toEqual([]);
  });
});

// ===========================================================================
// walkLayerTree — rel_path uses POSIX separators
// ===========================================================================

describe("walkLayerTree — rel_path uses POSIX forward slashes", () => {
  it("should return POSIX-format rel_path for nested files", async () => {
    // Arrange
    const layerRoot = await _makeLayerRoot();
    await fs.mkdir(path.join(layerRoot, "conventions"));
    await fs.writeFile(path.join(layerRoot, "conventions", "typescript.md"), "# TS");

    // Act
    const result = await walkLayerTree(tempDir);

    // Assert — find the nested file node and verify its rel_path uses '/'
    const conventionsDir = result.nodes.find((n) => n.name === "conventions");
    expect(conventionsDir).toBeDefined();
    if (conventionsDir?.children) {
      const tsFile = conventionsDir.children.find((n) => n.name === "typescript.md");
      expect(tsFile).toBeDefined();
      expect(tsFile?.rel_path).toBe("conventions/typescript.md");
      expect(tsFile?.rel_path).not.toContain("\\");
    }
  });
});

// ===========================================================================
// readLayerFile — SEC5/SEC10: no absolute path in response body
// ===========================================================================

describe("readLayerFile — no absolute server path in any response field (SEC5/SEC10)", () => {
  it("should not include the resolved absolute path in any field of a successful response", async () => {
    // Arrange
    const content = "# safe content";
    const rel = "conventions/typescript.md";
    await _writeLayerFile(rel, content);

    // Act
    const result = await readLayerFile(tempDir, rel);

    // Assert — check all string fields for absolute-path leaks
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(path.isAbsolute(result.rel_path)).toBe(false);
      expect(path.isAbsolute(result.name)).toBe(false);
      // rel_path must equal the input rel, not an absolute path
      expect(result.rel_path).toBe(rel);
    }
  });

  it("should echo the exact input rel in rel_path even for a nested path", async () => {
    // Arrange
    const rel = "agents/contexts/test-engineer-rules.md";
    const content = "# Rules";
    await _writeLayerFile(rel, content);

    // Act
    const result = await readLayerFile(tempDir, rel);

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.rel_path).toBe(rel);
    }
  });
});
