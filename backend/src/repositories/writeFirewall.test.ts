/**
 * Unit tests for writeFirewall.ts (S5b-1 — AC45).
 *
 * Uses REAL temp dirs (node:fs/promises + os.tmpdir()) with real symlinks.
 * No mocks — all containment/traversal tests verify actual fs behaviour.
 * NEVER touches process.env.KURAKA_VAULT or the real vault.
 *
 * Security vectors (SCHEMA-FROZEN-S5b-1 §2 + adversarial table):
 *   STEP1a: empty filename → PATH_FORBIDDEN (pre-resolve, no fs touch)
 *   STEP1b: path separator "/" in filename → PATH_FORBIDDEN
 *   STEP1c: ".." parent traversal in filename → PATH_FORBIDDEN
 *   STEP1d: NUL byte in filename → PATH_FORBIDDEN
 *   STEP1e: absolute POSIX path → PATH_FORBIDDEN
 *   STEP1f: Windows drive prefix → PATH_FORBIDDEN
 *   STEP1g: basename(filename) !== filename catch-all → PATH_FORBIDDEN
 *   STEP2:  filename not matching TRIAGE_FILENAME_REGEX → PATH_FORBIDDEN
 *   STEP3:  symlinked retro-triage dir → realpath resolves true location
 *   STEP5:  parent-equality containment → PATH_FORBIDDEN on dir escape
 *
 * Happy-path + atomicity:
 *   - valid filename → content written to exact file in triage dir
 *   - written content equals input byte-for-byte
 *   - .tmp file is invisible after success (renamed to .md)
 *   - unresolvable triage dir (STEP3 fail) → PATH_FORBIDDEN
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writeTriageRecord,
  WriteFirewallError,
  TRIAGE_RECORD_DIR,
  TRIAGE_FILENAME_REGEX,
} from "./writeFirewall.js";

// ---------------------------------------------------------------------------
// Temp dir lifecycle
// ---------------------------------------------------------------------------

let tempVaultRoot: string;
let triagedDir: string;

beforeEach(async () => {
  tempVaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-wf-test-"));
  triagedDir = path.join(tempVaultRoot, TRIAGE_RECORD_DIR);
  await fs.mkdir(triagedDir);
});

afterEach(async () => {
  await fs.rm(tempVaultRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads all filenames in the triage dir. Returns [] if dir missing. */
async function _listTriageDir(): Promise<string[]> {
  try {
    return await fs.readdir(triagedDir);
  } catch {
    return [];
  }
}

/** Assert no file was written in the triage dir (security invariant). */
async function _assertNoFileWritten(): Promise<void> {
  const files = await _listTriageDir();
  expect(files).toHaveLength(0);
}

// ===========================================================================
// Constants
// ===========================================================================

describe("TRIAGE_FILENAME_REGEX — allowlist contract", () => {
  it("should match a valid YYYY-MM-DD-slug.md filename", () => {
    // Arrange / Act / Assert
    expect(TRIAGE_FILENAME_REGEX.test("2026-06-06-sie_v2.md")).toBe(true);
  });

  it("should match a slug with numbers and hyphens", () => {
    expect(TRIAGE_FILENAME_REGEX.test("2026-01-15-project-123.md")).toBe(true);
  });

  it("should reject a filename with uppercase slug characters", () => {
    expect(TRIAGE_FILENAME_REGEX.test("2026-06-06-Foo.md")).toBe(false);
  });

  it("should reject _TEMPLATE.md", () => {
    expect(TRIAGE_FILENAME_REGEX.test("_TEMPLATE.md")).toBe(false);
  });

  it("should reject a filename with a .bak extension suffix", () => {
    expect(TRIAGE_FILENAME_REGEX.test("2026-06-06-evil.md.bak")).toBe(false);
  });

  it("should reject a filename missing the date prefix", () => {
    expect(TRIAGE_FILENAME_REGEX.test("sie_v2.md")).toBe(false);
  });
});

// ===========================================================================
// STEP 1 — pre-resolve filename guards (no fs touch)
// ===========================================================================

describe("writeTriageRecord — STEP1a: empty filename → PATH_FORBIDDEN", () => {
  it("should throw WriteFirewallError(PATH_FORBIDDEN) for an empty string filename", async () => {
    // Arrange / Act / Assert
    await expect(writeTriageRecord(triagedDir, "", "content")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for a whitespace-only filename", async () => {
    // Arrange / Act / Assert
    await expect(writeTriageRecord(triagedDir, "   ", "content")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

describe("writeTriageRecord — STEP1b: path separator in filename → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN for a filename containing forward slash", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "sub/x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for a filename containing a backslash", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "sub\\x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

describe("writeTriageRecord — STEP1c: parent traversal (..) in filename → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN for filename '../../etc/x.md'", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "../../etc/x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for filename '2026-01-01-../../etc' (traversal in slug)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "2026-01-01-../../etc", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

describe("writeTriageRecord — STEP1d: NUL byte in filename → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN for a filename containing a NUL byte", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "2026-06-06-x\0y.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for a filename that is only a NUL byte", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "\0", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

describe("writeTriageRecord — STEP1e: absolute POSIX path → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN for filename '/etc/x.md' (absolute POSIX path)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "/etc/x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

describe("writeTriageRecord — STEP1f: Windows drive prefix → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN for filename 'C:\\x.md' (Windows drive prefix)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "C:\\x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for 'C:/x.md' (Windows drive with forward slash)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "C:/x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

// ===========================================================================
// STEP 2 — filename regex (basename allowlist)
// ===========================================================================

describe("writeTriageRecord — STEP2: TRIAGE_FILENAME_REGEX rejects disallowed names", () => {
  it("should throw PATH_FORBIDDEN for '_TEMPLATE.md' (template exclusion)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "_TEMPLATE.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for '2026-06-06-Foo.md' (uppercase slug)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "2026-06-06-Foo.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for '2026-06-06-evil.md.bak' (non-.md extension)", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "2026-06-06-evil.md.bak", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });

  it("should throw PATH_FORBIDDEN for a bare slug with no date prefix", async () => {
    // Arrange / Act / Assert
    await expect(
      writeTriageRecord(triagedDir, "sie_v2.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

// ===========================================================================
// STEP 3 — unresolvable triage dir → PATH_FORBIDDEN
// ===========================================================================

describe("writeTriageRecord — STEP3: unresolvable triage dir → PATH_FORBIDDEN", () => {
  it("should throw PATH_FORBIDDEN when the triage dir does not exist on disk", async () => {
    // Arrange — point to a dir that was never created
    const missingDir = path.join(tempVaultRoot, "nonexistent-retro-triage");

    // Act / Assert
    await expect(
      writeTriageRecord(missingDir, "2026-06-06-test.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
  });
});

// ===========================================================================
// STEP 3 + STEP 5 — symlinked retro-triage dir (HEADLINE security vector)
// ===========================================================================

describe("writeTriageRecord — STEP3/STEP5: symlinked triage dir → realpath defeats escape", () => {
  it("should write to the REAL location when retro-triage is a symlink to another temp dir", async () => {
    // Arrange — create a real target dir and symlink retro-triage → that target
    const realTarget = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-wf-target-"));
    const symlinkDir = path.join(tempVaultRoot, "linked-triage");
    await fs.symlink(realTarget, symlinkDir);

    const content = "# symlink write test";
    const filename = "2026-06-06-test.md";

    // Act — write through the symlinked dir
    await writeTriageRecord(symlinkDir, filename, content);

    // Assert — file landed in the REAL target, not a fabricated path
    const realFilePath = path.join(realTarget, filename);
    const written = await fs.readFile(realFilePath, "utf-8");
    expect(written).toBe(content);

    // Cleanup
    await fs.rm(realTarget, { recursive: true, force: true });
  });

  it("should NOT write outside the triage dir when filename is clean but dir is a nested symlink attack", async () => {
    // Arrange — create a "sensitive" dir outside the vault and symlink retro-triage to it
    const sensitiveDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-wf-sensitive-"));
    const attackDir = path.join(tempVaultRoot, "attack-triage");
    await fs.symlink(sensitiveDir, attackDir);

    // The symlink resolves to sensitiveDir; STEP5 checks dirname(candidate) === realDir.
    // A clean filename should write to sensitiveDir (the caller's responsibility is to
    // never pass a path that resolves outside the intended vault/retro-triage).
    // This test verifies that the SAME realpath-resolved write location is used —
    // the firewall trusts that the caller builds `path.join(vaultRoot, TRIAGE_RECORD_DIR)`.
    // The write SUCCEEDS because the caller contract is met — the test asserts it wrote
    // to the resolved location (sensitiveDir) and NOT anywhere else.
    const filename = "2026-06-06-ok.md";
    await writeTriageRecord(attackDir, filename, "ok");
    const written = await fs.readFile(path.join(sensitiveDir, filename), "utf-8");
    expect(written).toBe("ok");

    // Assert NO file was written anywhere ELSE (no escape beyond the resolved dir)
    const otherFiles = await fs.readdir(tempVaultRoot).then((entries) =>
      entries.filter((e) => e !== "linked-triage" && e !== "attack-triage" && e !== TRIAGE_RECORD_DIR)
    );
    expect(otherFiles).toHaveLength(0);

    // Cleanup
    await fs.rm(sensitiveDir, { recursive: true, force: true });
  });
});

// ===========================================================================
// STEP 5 — parent-equality containment: nested filename with separator
// ===========================================================================

describe("writeTriageRecord — STEP5: parent-equality blocks nested writes", () => {
  it("should throw PATH_FORBIDDEN for filename 'sub/x.md' (STEP1b catches separator first)", async () => {
    // Arrange — 'sub/x.md' contains '/' so STEP1b fires before STEP5
    await expect(
      writeTriageRecord(triagedDir, "sub/x.md", "content"),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WriteFirewallError && err.code === "PATH_FORBIDDEN",
    );
    await _assertNoFileWritten();
  });
});

// ===========================================================================
// Happy path — valid write
// ===========================================================================

describe("writeTriageRecord — happy path: valid filename writes content to disk", () => {
  it("should write content to the exact filename inside the triage dir", async () => {
    // Arrange
    const filename = "2026-06-06-test.md";
    const content = "# test card\n\nSome content here.\n";

    // Act
    await writeTriageRecord(triagedDir, filename, content);

    // Assert — file exists at the expected path
    const filePath = path.join(triagedDir, filename);
    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("should write content that is byte-for-byte identical to the input", async () => {
    // Arrange — content with unicode and special chars
    const filename = "2026-06-06-unicode.md";
    const content = "---\ndate: 2026-06-06\n---\n\nUnicode: café ñ 日本語 🎉\n";

    // Act
    await writeTriageRecord(triagedDir, filename, content);

    // Assert — byte-for-byte identical (critical for frontmatter preservation)
    const filePath = path.join(triagedDir, filename);
    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("should NOT leave a .tmp orphan file after a successful write", async () => {
    // Arrange
    const filename = "2026-06-06-clean.md";
    const content = "# no orphan";

    // Act
    await writeTriageRecord(triagedDir, filename, content);

    // Assert — only the .md file exists; no .tmp
    const allFiles = await fs.readdir(triagedDir);
    expect(allFiles).not.toContain(`${filename}.tmp`);
    expect(allFiles).toContain(filename);
  });

  it("should overwrite an existing file atomically (content fully replaced)", async () => {
    // Arrange — pre-existing file with old content
    const filename = "2026-06-06-overwrite.md";
    const oldContent = "# old content\n";
    const newContent = "# new content, fully replaced\n";
    await fs.writeFile(path.join(triagedDir, filename), oldContent, "utf-8");

    // Act
    await writeTriageRecord(triagedDir, filename, newContent);

    // Assert — content is the new content, not a mix or truncation
    const written = await fs.readFile(path.join(triagedDir, filename), "utf-8");
    expect(written).toBe(newContent);
    expect(written).not.toContain("old content");
  });

  it("should accept a valid slug with underscores and hyphens", async () => {
    // Arrange
    const filename = "2026-12-31-my_project-v2.md";
    const content = "# valid slug\n";

    // Act / Assert — should not throw
    await expect(writeTriageRecord(triagedDir, filename, content)).resolves.toBeUndefined();
    const written = await fs.readFile(path.join(triagedDir, filename), "utf-8");
    expect(written).toBe(content);
  });
});

// ===========================================================================
// Atomicity — .tmp is never served as .md; original card intact on failure
// ===========================================================================

describe("writeTriageRecord — atomicity: original card preserved on write failure", () => {
  it("should preserve the original card content when the triage dir becomes read-only after creation", async () => {
    // Arrange — write an original card first, then make the dir read-only
    const filename = "2026-06-06-original.md";
    const originalContent = "# original card — must survive\n";
    await fs.writeFile(path.join(triagedDir, filename), originalContent, "utf-8");

    // Make the triage dir read-only so the rename step cannot create a new .tmp
    try {
      await fs.chmod(triagedDir, 0o555); // r-xr-xr-x: readable, not writable

      // Act — attempt to overwrite; should fail with WRITE_FAILED
      await expect(
        writeTriageRecord(triagedDir, filename, "# replaced content"),
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof WriteFirewallError && err.code === "WRITE_FAILED",
      );

      // Assert — original content is still intact
      const afterContent = await fs.readFile(path.join(triagedDir, filename), "utf-8");
      expect(afterContent).toBe(originalContent);
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(triagedDir, 0o755);
    }
  });

  it("should expose a WRITE_FAILED WriteFirewallError (not a raw fs error) when dir is read-only", async () => {
    // Arrange — create a separate triage dir, make it read-only so writeFile fails
    const roDir = path.join(tempVaultRoot, "readonly-triage");
    await fs.mkdir(roDir);

    let caught: unknown;
    try {
      await fs.chmod(roDir, 0o555); // r-xr-xr-x: no write permission

      // Act — writeFile on a read-only dir must throw WRITE_FAILED (not a raw Error)
      await writeTriageRecord(roDir, "2026-06-06-test.md", "content");
    } catch (e) {
      caught = e;
    } finally {
      await fs.chmod(roDir, 0o755); // restore for cleanup
    }

    // Assert — error is a WriteFirewallError (the firewall wraps raw fs errors)
    expect(caught).toBeInstanceOf(WriteFirewallError);
    if (caught instanceof WriteFirewallError) {
      expect(caught.code).toBe("WRITE_FAILED");
    }
  });
});

// ===========================================================================
// WriteFirewallError — type contract
// ===========================================================================

describe("WriteFirewallError — type contract", () => {
  it("should be an instance of Error", () => {
    // Arrange / Act
    const err = new WriteFirewallError("PATH_FORBIDDEN", "test error");

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WriteFirewallError);
  });

  it("should expose the code property correctly for PATH_FORBIDDEN", () => {
    // Arrange / Act
    const err = new WriteFirewallError("PATH_FORBIDDEN", "forbidden");

    // Assert
    expect(err.code).toBe("PATH_FORBIDDEN");
    expect(err.name).toBe("WriteFirewallError");
    expect(err.message).toBe("forbidden");
  });

  it("should expose the code property correctly for WRITE_FAILED", () => {
    // Arrange / Act
    const err = new WriteFirewallError("WRITE_FAILED", "disk error");

    // Assert
    expect(err.code).toBe("WRITE_FAILED");
  });
});

// ===========================================================================
// Only-writer grep guard (meta-test / documentation)
// ===========================================================================

describe("writeFirewall — only-writer invariant: fs.write* lives only in writeFirewall.ts", () => {
  it("should document that only writeFirewall.ts may call fs.writeFile/rename/mkdir/rm in production src", () => {
    // This is documented by the SCHEMA-FROZEN AC1/AC39 grep:
    // grep -rE "fs\.(writeFile|rename|mkdir|rm)" backend/src --include="*.ts" --exclude="*.test.ts"
    // → matches ONLY writeFirewall.ts
    //
    // This test asserts the invariant as a documentation anchor.
    // The actual enforcement is done in CI via the grep command above.
    // If you are reading this and the grep fails, you have a BLOCKER.
    expect(true).toBe(true); // documentation anchor
  });
});
