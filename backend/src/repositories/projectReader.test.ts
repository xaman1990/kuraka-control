/**
 * Unit tests for projectReader repository (AC-36, S3 addition).
 *
 * Uses real temp dirs (node:fs/promises + node:os.tmpdir) — no mocks.
 * Covers: readLockVersion (valid lock, absent file, malformed YAML, missing field,
 * numeric coercion), readVaultVersion (valid init.py, absent file, no constant,
 * never executes), findProjectByName (found, not found), and readProjectConfig
 * (valid YAML → curated ProjectConfig, absent file → null, malformed YAML → null,
 * non-object YAML → null) — S3 addition (T2).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readLockVersion, readVaultVersion, findProjectByName, readProjectConfig } from "./projectReader.js";

// ---------------------------------------------------------------------------
// Temp dir lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-projectreader-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Writes a kuraka.lock YAML file to `dir` and returns the dir path. */
async function _writeLockFile(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, "kuraka.lock"), content, "utf-8");
}

/** Writes a kuraka-init.py file to `dir` with the given content. */
async function _writeInitPy(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, "kuraka-init.py"), content, "utf-8");
}

/** Minimal valid kuraka.lock content with a standard version. */
function _validLockContent(version: string = "0.3.4"): string {
  return `# kuraka.lock — pins the mounted Kuraka framework version for this project.
kuraka_version: "${version}"
mounted_at: 2026-06-07
vault: /Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka
`;
}

/** Minimal kuraka-init.py content with DEFAULT_VERSION constant. */
function _validInitPyContent(version: string = "0.3.4"): string {
  return `#!/usr/bin/env python3
"""Kuraka framework initializer."""

# Framework metadata
DEFAULT_VERSION = "${version}"
FRAMEWORK_NAME = "kuraka"
`;
}

/** Minimal valid vault registry project .md content. */
function _makeValidProjectMd(name: string, projectPath: string): string {
  return `---
name: ${name}
path: ${projectPath}
stack: node-express+react
kuraka_version: "0.3.4"
has_project_layer: true
default_mode: normal
status: active
repo_url:
focus_scope:
last_mount: 2026-06-07
last_sync:
tags: []
---

# ${name}
`;
}

// ---------------------------------------------------------------------------
// readLockVersion — happy path
// ---------------------------------------------------------------------------

describe("readLockVersion — valid lock file", () => {
  it("should return the kuraka_version string from a valid lock file with YAML comments", async () => {
    // Arrange
    await _writeLockFile(tempDir, _validLockContent("0.3.4"));

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.4");
  });

  it("should coerce a numeric-like YAML value to a string (e.g. unquoted 0.3 → '0.3')", async () => {
    // Arrange — YAML parses unquoted 0.3 as a float
    const content = `kuraka_version: 0.3
mounted_at: 2026-06-07
vault: /some/path
`;
    await _writeLockFile(tempDir, content);

    // Act
    const result = await readLockVersion(tempDir);

    // Assert — coerced to string, not number
    expect(result).toBe("0.3");
    expect(typeof result).toBe("string");
  });

  it("should handle a lock file with single-quoted version value", async () => {
    // Arrange
    const content = `kuraka_version: '0.3.4'\nmounted_at: 2026-06-07\n`;
    await _writeLockFile(tempDir, content);

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.4");
  });
});

// ---------------------------------------------------------------------------
// readLockVersion — null cases (never throws)
// ---------------------------------------------------------------------------

describe("readLockVersion — absent file returns null", () => {
  it("should return null when kuraka.lock does not exist in the given dir", async () => {
    // Arrange — no lock file written

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw when the lock file is absent", async () => {
    // Arrange / Act / Assert
    await expect(readLockVersion(tempDir)).resolves.toBeNull();
  });
});

describe("readLockVersion — malformed YAML returns null", () => {
  it("should return null when the lock file contains garbage that cannot be YAML-parsed", async () => {
    // Arrange
    await _writeLockFile(tempDir, ":: this: is: not: valid: yaml: [unclosed");

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw when the lock file is malformed YAML", async () => {
    // Arrange
    await _writeLockFile(tempDir, "{{{{ broken yaml");

    // Act / Assert
    await expect(readLockVersion(tempDir)).resolves.toBeNull();
  });

  it("should return null when the lock file is a valid YAML scalar (not an object)", async () => {
    // Arrange — valid YAML but scalar, not a key-value map
    await _writeLockFile(tempDir, "just a string value");

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when the lock file is a YAML array (not an object)", async () => {
    // Arrange
    await _writeLockFile(tempDir, "- item1\n- item2\n");

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });
});

describe("readLockVersion — missing or empty kuraka_version field returns null", () => {
  it("should return null when kuraka_version key is absent from the lock file", async () => {
    // Arrange — valid YAML but no kuraka_version key
    await _writeLockFile(tempDir, "mounted_at: 2026-06-07\nvault: /some/path\n");

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when kuraka_version is an empty string", async () => {
    // Arrange
    await _writeLockFile(tempDir, `kuraka_version: ""\nmounted_at: 2026-06-07\n`);

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when kuraka_version is null in YAML", async () => {
    // Arrange
    await _writeLockFile(tempDir, "kuraka_version: null\nmounted_at: 2026-06-07\n");

    // Act
    const result = await readLockVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readVaultVersion — happy path
// ---------------------------------------------------------------------------

describe("readVaultVersion — valid kuraka-init.py", () => {
  it("should extract the version string from a DEFAULT_VERSION = '...' constant", async () => {
    // Arrange
    await _writeInitPy(tempDir, _validInitPyContent("0.3.4"));

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.4");
  });

  it("should extract the version when the constant uses double quotes", async () => {
    // Arrange
    await _writeInitPy(tempDir, `DEFAULT_VERSION = "0.3.10"\nOTHER = "x"\n`);

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.10");
  });

  it("should extract the version when the constant uses single quotes", async () => {
    // Arrange
    await _writeInitPy(tempDir, `DEFAULT_VERSION = '0.4.0'\n`);

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBe("0.4.0");
  });

  it("should extract the version regardless of extra whitespace around the '=' sign", async () => {
    // Arrange
    await _writeInitPy(tempDir, `DEFAULT_VERSION  =  "0.3.5"\n`);

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.5");
  });

  it("should NOT execute the kuraka-init.py file (read-only regex parse)", async () => {
    // Arrange — a script that would throw if executed, but contains DEFAULT_VERSION
    const dangerousContent = `DEFAULT_VERSION = "0.3.4"\nraise RuntimeError("should not execute")\n`;
    await _writeInitPy(tempDir, dangerousContent);

    // Act — must succeed without error (file is regex-parsed, not executed)
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBe("0.3.4");
  });
});

// ---------------------------------------------------------------------------
// readVaultVersion — null cases (never throws)
// ---------------------------------------------------------------------------

describe("readVaultVersion — absent file returns null", () => {
  it("should return null when kuraka-init.py does not exist in vaultRoot", async () => {
    // Arrange — no file written

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw when kuraka-init.py is absent", async () => {
    // Arrange / Act / Assert
    await expect(readVaultVersion(tempDir)).resolves.toBeNull();
  });
});

describe("readVaultVersion — no DEFAULT_VERSION constant → null", () => {
  it("should return null when the file exists but has no DEFAULT_VERSION constant", async () => {
    // Arrange
    await _writeInitPy(tempDir, `# kuraka-init.py\nFRAMEWORK = "kuraka"\nVERSION = "0.3.4"\n`);

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert — FRAMEWORK and VERSION don't match the anchored regex
    expect(result).toBeNull();
  });

  it("should return null when DEFAULT_VERSION is commented out", async () => {
    // Arrange
    await _writeInitPy(tempDir, `# DEFAULT_VERSION = "0.3.4"\nFRAMEWORK = "kuraka"\n`);

    // Act
    const result = await readVaultVersion(tempDir);

    // Assert — anchored to start of line (^), # comment won't match
    expect(result).toBeNull();
  });

  it("should not throw when the file exists but has no matching constant", async () => {
    // Arrange
    await _writeInitPy(tempDir, "# empty script\n");

    // Act / Assert
    await expect(readVaultVersion(tempDir)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findProjectByName — uses a real vault temp dir with projects/ subdir
// ---------------------------------------------------------------------------

describe("findProjectByName — happy path", () => {
  it("should return the matching ProjectSummary when the name exists in the registry", async () => {
    // Arrange — set up a minimal vault with projects/ subdir
    await fs.mkdir(path.join(tempDir, "projects"));
    await fs.writeFile(
      path.join(tempDir, "projects", "sie_v2.md"),
      _makeValidProjectMd("sie_v2", "/Users/xmn/Desarrollos/sie_v2"),
      "utf-8",
    );

    // Act
    const result = await findProjectByName("sie_v2", { vaultRoot: tempDir });

    // Assert
    expect(result).not.toBeNull();
    expect(result?.name).toBe("sie_v2");
    expect(result?.path).toBe("/Users/xmn/Desarrollos/sie_v2");
    expect(result?.governance).toBe("project");
  });
});

describe("findProjectByName — name not in registry returns null", () => {
  it("should return null when the registry has projects but the name is not among them", async () => {
    // Arrange
    await fs.mkdir(path.join(tempDir, "projects"));
    await fs.writeFile(
      path.join(tempDir, "projects", "sie_v2.md"),
      _makeValidProjectMd("sie_v2", "/Users/xmn/Desarrollos/sie_v2"),
      "utf-8",
    );

    // Act
    const result = await findProjectByName("nonexistent", { vaultRoot: tempDir });

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when the registry is empty (no .md files)", async () => {
    // Arrange — empty projects dir
    await fs.mkdir(path.join(tempDir, "projects"));

    // Act
    const result = await findProjectByName("any-name", { vaultRoot: tempDir });

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readProjectConfig — S3 addition (T2)
// Mirrors the readLockVersion temp-dir style (SCHEMA-FROZEN-S3.md §5).
// ---------------------------------------------------------------------------

/** Writes a kuraka.config.yaml file to `dir`. */
async function _writeConfigYaml(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, "kuraka.config.yaml"), content, "utf-8");
}

/**
 * A realistic kuraka-control-shaped kuraka.config.yaml.
 * All 10 curated fields present with their live values.
 */
function _validConfigYamlContent(): string {
  return `# kuraka.config.yaml — kuraka-control (realistic fixture)
name: kuraka-control
description: Local control plane for the Kuraka multi-agent framework.

stack:
  backend:
    language: typescript
    framework: express
  frontend:
    language: typescript
    framework: react
    state_mgmt: zustand

architecture:
  layers:
    - domain
    - repository
    - service
    - route

conventions:
  naming_language: english
  max_file_loc: 400
  max_function_loc: 50

workflow:
  default_mode: normal
`;
}

describe("readProjectConfig — valid kuraka.config.yaml → populated ProjectConfig", () => {
  it("should return a populated ProjectConfig with all 10 fields when the file is valid YAML", async () => {
    // Arrange
    await _writeConfigYaml(tempDir, _validConfigYamlContent());

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert — non-null and all curated fields populated
    expect(result).not.toBeNull();
    expect(result?.backend_language).toBe("typescript");
    expect(result?.backend_framework).toBe("express");
    expect(result?.frontend_language).toBe("typescript");
    expect(result?.frontend_framework).toBe("react");
    expect(result?.state_mgmt).toBe("zustand");
    expect(result?.architecture_layers).toEqual(["domain", "repository", "service", "route"]);
    expect(result?.naming_language).toBe("english");
    expect(result?.max_file_loc).toBe(400);
    expect(result?.max_function_loc).toBe(50);
    expect(result?.default_mode).toBe("normal");
  });

  it("should return a result that passes ProjectConfig zod validation", async () => {
    // Arrange
    await _writeConfigYaml(tempDir, _validConfigYamlContent());
    const { ProjectConfig } = await import("@kuraka-control/contracts");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert — the curated output must satisfy the frozen zod shape
    expect(result).not.toBeNull();
    const parsed = ProjectConfig.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("should not throw for a valid kuraka.config.yaml file", async () => {
    // Arrange
    await _writeConfigYaml(tempDir, _validConfigYamlContent());

    // Act / Assert
    await expect(readProjectConfig(tempDir)).resolves.not.toBeNull();
  });
});

describe("readProjectConfig — absent file → null (config-absent rule, SCHEMA-FROZEN-S3.md §3)", () => {
  it("should return null when kuraka.config.yaml does not exist in the given dir", async () => {
    // Arrange — no config file written

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw when kuraka.config.yaml is absent", async () => {
    // Arrange / Act / Assert
    await expect(readProjectConfig(tempDir)).resolves.toBeNull();
  });
});

describe("readProjectConfig — malformed YAML → null (never throws)", () => {
  it("should return null when the config file contains an unclosed flow sequence (parse error)", async () => {
    // Arrange — `[unclosed` causes the yaml library to throw a parse error
    await _writeConfigYaml(tempDir, "stack:\n  backend:\n    language: [unclosed");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw when the config file contains malformed YAML", async () => {
    // Arrange — tab indentation is illegal in YAML and causes the yaml library to throw
    await _writeConfigYaml(tempDir, "stack:\n\tbackend: foo");

    // Act / Assert
    await expect(readProjectConfig(tempDir)).resolves.toBeNull();
  });

  it("should return null when the config YAML has duplicate map keys (parse error)", async () => {
    // Arrange — the yaml library rejects duplicate keys by default
    await _writeConfigYaml(tempDir, "stack: foo\nstack: bar\n");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });
});

describe("readProjectConfig — non-object YAML → null (config-absent rule §3)", () => {
  it("should return null when the YAML file parses to a bare string scalar", async () => {
    // Arrange — valid YAML but a scalar, not a mapping
    await _writeConfigYaml(tempDir, "just a plain string");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when the YAML file parses to a bare array", async () => {
    // Arrange — valid YAML but a sequence, not a mapping
    await _writeConfigYaml(tempDir, "- item1\n- item2\n");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when the YAML file parses to a bare number", async () => {
    // Arrange
    await _writeConfigYaml(tempDir, "42");

    // Act
    const result = await readProjectConfig(tempDir);

    // Assert
    expect(result).toBeNull();
  });

  it("should not throw for any non-object YAML variant", async () => {
    // Arrange
    await _writeConfigYaml(tempDir, "- item1\n- item2\n");

    // Act / Assert
    await expect(readProjectConfig(tempDir)).resolves.toBeNull();
  });
});
