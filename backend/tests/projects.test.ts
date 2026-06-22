/**
 * Integration tests for GET /api/projects (AC-31).
 *
 * Spins an Express app on a random port (no supertest needed — Node 22 has
 * native fetch). Vault path is injected via a real temp dir so the full
 * stack (route → service → repository → domain) executes without mocks.
 *
 * Cases:
 *   - 200 + { projects: [...], empty: false } — populated vault
 *   - 200 + { projects: [], empty: true }    — empty vault
 *   - 500 + { error: { code: "VAULT_UNREADABLE", detail: { path: <root> } } } — missing vault
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/index.js";
import { ProjectListResponse } from "@kuraka-control/contracts";

/** Starts an Express app on a random OS-assigned port; returns { server, baseUrl }. */
async function _startServer(
  app: ReturnType<typeof createApp>,
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

/** Stops a server and waits for it to close. */
async function _stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Helpers — minimal valid project .md content
// ---------------------------------------------------------------------------

function _makeValidProjectMd(name: string = "sie_v2"): string {
  return `---
name: ${name}
path: /Users/xmn/Desarrollos/${name}
stack: python-fastapi / vue-pinia
kuraka_version: "0.3.4"
has_project_layer: true
default_mode: normal
status: active
repo_url: https://github.com/org/${name}
focus_scope:
last_mount: 2026-06-01
last_sync:
tags:
  - backend
  - frontend
---

# ${name}
`;
}

// ---------------------------------------------------------------------------
// Temp vault lifecycle
// ---------------------------------------------------------------------------

let tempVaultRoot: string;
let server: http.Server;
let baseUrl: string;

afterEach(async () => {
  if (server) await _stopServer(server);
  if (tempVaultRoot) await fs.rm(tempVaultRoot, { recursive: true, force: true });
});

async function _setupVault(withProjectsMd: boolean, projectName?: string): Promise<void> {
  tempVaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-projects-integration-"));
  await fs.mkdir(path.join(tempVaultRoot, "projects"));
  if (withProjectsMd) {
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", `${projectName ?? "sie_v2"}.md`),
      _makeValidProjectMd(projectName ?? "sie_v2"),
      "utf-8",
    );
  }
}

// ---------------------------------------------------------------------------
// 200 — populated vault
// ---------------------------------------------------------------------------

describe("GET /api/projects — populated vault", () => {
  beforeEach(async () => {
    await _setupVault(true, "sie_v2");
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 200 with projects array and empty: false", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape
    const body = await response.json() as unknown;
    const parsed = ProjectListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.empty).toBe(false);
    expect(parsed.data.projects).toHaveLength(1);
  });

  it("should return a project with the correct name from the vault file", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ name: string }> };

    // Assert
    expect(body.projects[0]?.name).toBe("sie_v2");
  });

  it("should return a project with governance: 'project' (server-derived constant)", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ governance: string }> };

    // Assert
    expect(body.projects[0]?.governance).toBe("project");
  });

  it("should return null for empty-string nullable fields (last_sync is empty in fixture)", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ last_sync: string | null }> };

    // Assert — last_sync was "" in frontmatter; must be null in response
    expect(body.projects[0]?.last_sync).toBeNull();
  });

  it("should return Content-Type: application/json", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});

// ---------------------------------------------------------------------------
// 200 — empty vault
// ---------------------------------------------------------------------------

describe("GET /api/projects — empty vault", () => {
  beforeEach(async () => {
    await _setupVault(false); // no .md files
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 200 with empty projects array and empty: true", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape
    const body = await response.json() as { projects: unknown[]; empty: boolean };
    expect(body.projects).toEqual([]);
    expect(body.empty).toBe(true);
  });

  it("should validate against ProjectListResponse schema when vault is empty", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as unknown;

    // Assert
    const parsed = ProjectListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 500 — vault unreadable (missing directory)
// ---------------------------------------------------------------------------

describe("GET /api/projects — vault unreadable", () => {
  it("should return 500 with VAULT_UNREADABLE error code when vault does not exist", async () => {
    // Arrange
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-missing-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(500);

    // Assert — error envelope
    const body = await response.json() as {
      error: { code: string; message: string; detail: { path: string } };
    };
    expect(body.error.code).toBe("VAULT_UNREADABLE");
  });

  it("should include the vault ROOT path in detail.path (not the projects/ subdir)", async () => {
    // Arrange — this is the §5 regression guard: detail.path must be env.vaultRoot
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-missing-path-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as {
      error: { detail: { path: string } };
    };

    // Assert — must be the vault root, not vault/projects
    expect(body.error.detail.path).toBe(nonExistentVault);
    expect(body.error.detail.path).not.toContain("projects");
  });

  it("should include a human-readable message in the error envelope", async () => {
    // Arrange
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-msg-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { error: { message: string } };

    // Assert
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
