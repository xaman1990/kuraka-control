/**
 * Integration tests for GET /api/triage (S5a — T3).
 *
 * Spins an Express app on a random port using createApp() with a temp vault.
 * The full stack executes without mocks: route → service → repository → domain.
 *
 * Mirrors backend/tests/projects.test.ts patterns exactly
 * (createApp factory, _startServer/_stopServer, temp vault, native fetch).
 *
 * Cases:
 *   - 200 + { docs: [...], empty: false } — populated retro-triage/ dir
 *   - 200 + { docs: [], empty: true }     — empty retro-triage/ dir
 *   - 500 + { error: { code: "VAULT_UNREADABLE" } } — missing retro-triage/ dir
 *
 * SCHEMA-FROZEN-S5a §5 (endpoint + error mapping).
 */
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/index.js";
import { TriageListResponse } from "@kuraka-control/contracts";

// ---------------------------------------------------------------------------
// Server helpers (mirroring projects.test.ts)
// ---------------------------------------------------------------------------

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

async function _stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Helpers — minimal valid triage card content
// ---------------------------------------------------------------------------

function _makeValidTriageCard(project: string = "sie_v2"): string {
  return [
    "---",
    `project: ${project}`,
    "source: RETRO-2026-06-06",
    'date: "2026-06-06"',  // quoted to prevent js-yaml from coercing to Date object
    "decision: applied",
    "applied: true",
    "tags:",
    "  - retro-triage",
    "---",
    "",
    "| # | Finding | Routing | Target file | Severity | Status |",
    "|---|---------|---------|-------------|----------|--------|",
    `| P1 | Bug in ${project} | project | \`agents/x.md\` | HIGH | applied |`,
    "",
    "## Decisions & rationale",
    "",
    "Addressed in this cycle.",
  ].join("\n");
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

/** Creates the vault root and optionally the retro-triage/ subdir. */
async function _setupVault(withTriageDir: boolean = true): Promise<void> {
  tempVaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-triage-integration-"));
  if (withTriageDir) {
    await fs.mkdir(path.join(tempVaultRoot, "retro-triage"));
  }
}

// ---------------------------------------------------------------------------
// 200 — populated retro-triage/ directory
// ---------------------------------------------------------------------------

describe("GET /api/triage — populated vault", () => {
  it("should return 200 with docs array and empty: false when retro-triage/ has one card", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape passes TriageListResponse zod schema
    const body = await response.json() as unknown;
    const parsed = TriageListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.empty).toBe(false);
    expect(parsed.data.docs).toHaveLength(1);
  });

  it("should return the correct doc id (filename minus .md)", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as { docs: Array<{ id: string }> };

    // Assert
    expect(body.docs[0]?.id).toBe("2026-06-06-sie_v2");
  });

  it("should return the project field from the card frontmatter", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as { docs: Array<{ project: string }> };

    // Assert
    expect(body.docs[0]?.project).toBe("sie_v2");
  });

  it("should return findings array with the parsed rows inside each doc", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as {
      docs: Array<{ findings: Array<{ id: string }> }>;
    };

    // Assert
    expect(body.docs[0]?.findings).toHaveLength(1);
    expect(body.docs[0]?.findings[0]?.id).toBe("P1");
  });

  it("should exclude _TEMPLATE.md from results (template exclusion end-to-end)", async () => {
    // Arrange — template file + one real card
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "_TEMPLATE.md"),
      _makeValidTriageCard("template"),
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as { docs: Array<{ id: string }> };

    // Assert — only the real card; template excluded
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0]?.id).toBe("2026-06-06-sie_v2");
  });

  it("should return Content-Type: application/json", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "2026-06-06-sie_v2.md"),
      _makeValidTriageCard("sie_v2"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);

    // Assert
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});

// ---------------------------------------------------------------------------
// 200 — empty retro-triage/ directory → { docs: [], empty: true }
// ---------------------------------------------------------------------------

describe("GET /api/triage — empty retro-triage/ directory", () => {
  it("should return 200 with empty docs array and empty: true", async () => {
    // Arrange — retro-triage/ exists but has no .md files
    await _setupVault(true);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape
    const body = await response.json() as { docs: unknown[]; empty: boolean };
    expect(body.docs).toEqual([]);
    expect(body.empty).toBe(true);
  });

  it("should validate against TriageListResponse schema when vault is empty", async () => {
    // Arrange
    await _setupVault(true);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as unknown;

    // Assert
    const parsed = TriageListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("should return empty: true when only _TEMPLATE.md is present (excluded, so effectively empty)", async () => {
    // Arrange
    await _setupVault(true);
    await fs.writeFile(
      path.join(tempVaultRoot, "retro-triage", "_TEMPLATE.md"),
      _makeValidTriageCard("template"),
      "utf-8",
    );
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as { docs: unknown[]; empty: boolean };

    // Assert
    expect(body.docs).toEqual([]);
    expect(body.empty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 500 — missing retro-triage/ directory → VAULT_UNREADABLE
// ---------------------------------------------------------------------------

describe("GET /api/triage — vault unreadable (missing retro-triage/ dir)", () => {
  it("should return 500 with VAULT_UNREADABLE error code when retro-triage/ dir does not exist", async () => {
    // Arrange — vault root exists but retro-triage/ subdir does NOT
    await _setupVault(false);  // withTriageDir: false
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);

    // Assert — status
    expect(response.status).toBe(500);

    // Assert — error envelope shape (SCHEMA-FROZEN §5)
    const body = await response.json() as {
      error: { code: string; message: string; detail: { path: string } };
    };
    expect(body.error.code).toBe("VAULT_UNREADABLE");
  });

  it("should return 500 with VAULT_UNREADABLE when the entire vault root does not exist", async () => {
    // Arrange — vault root itself is missing (no mkdtemp)
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-triage-missing-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;
    // Set tempVaultRoot so afterEach cleanup doesn't fail on missing dir
    tempVaultRoot = nonExistentVault;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);

    // Assert
    expect(response.status).toBe(500);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("VAULT_UNREADABLE");
  });

  it("should include a human-readable message in the error envelope", async () => {
    // Arrange
    await _setupVault(false);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as { error: { message: string } };

    // Assert
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("should include a detail.path in the error envelope (SCHEMA-FROZEN §5 shape)", async () => {
    // Arrange
    await _setupVault(false);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/triage`);
    const body = await response.json() as {
      error: { detail: { path: string } };
    };

    // Assert — detail.path is a non-empty string (the vault root path)
    expect(typeof body.error.detail.path).toBe("string");
    expect(body.error.detail.path.length).toBeGreaterThan(0);
  });
});
