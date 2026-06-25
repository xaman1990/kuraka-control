/**
 * Unit tests for triageActions.ts (S5b-1 — AC47).
 *
 * Tests all three action functions with a TEMP vault + real file I/O.
 * NEVER touches process.env.KURAKA_VAULT or the real vault.
 * Injects vaultRoot via the input argument.
 *
 * Cases:
 *   routeFinding  — sets routing cell (col 2); unknown card → NOT_FOUND;
 *                   unknown finding_id → NOT_FOUND; no finding_id → BAD_REQUEST;
 *                   response equals disk content (disk truth re-read)
 *   deferTriage   — finding_id: sets status (col 5) → "deferred";
 *                   no finding_id: sets frontmatter decision → "deferred";
 *                   unknown finding_id → NOT_FOUND; unknown card → NOT_FOUND
 *   rejectTriage  — finding_id: sets status (col 5) → "rejected";
 *                   no finding_id: sets frontmatter decision → "rejected";
 *                   unknown finding_id → NOT_FOUND; unknown card → NOT_FOUND
 *
 * Integrity assertions (the BLOCKER regression):
 *   - After every write the date: YYYY-MM-DD line is preserved verbatim (no ISO coercion)
 *   - After every write the re-read TriageDoc matches the actual disk content
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { routeFinding, deferTriage, rejectTriage } from "./triageActions.js";
import { TRIAGE_RECORD_DIR } from "../repositories/writeFirewall.js";
import { parseTriageDoc } from "../domain/triage.js";

// ---------------------------------------------------------------------------
// Temp vault lifecycle
// ---------------------------------------------------------------------------

let tempVaultRoot: string;
let triageDir: string;

beforeEach(async () => {
  tempVaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-actions-test-"));
  triageDir = path.join(tempVaultRoot, TRIAGE_RECORD_DIR);
  await fs.mkdir(triageDir);
});

afterEach(async () => {
  await fs.rm(tempVaultRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/** Card ID used throughout tests. */
const CARD_ID = "2026-06-06-sie_v2";
const CARD_FILENAME = `${CARD_ID}.md`;

/**
 * Creates a realistic triage card with controllable routing/status for each
 * finding row.
 *
 * Date is YAML-quoted as '"2026-06-06"' to prevent js-yaml from coercing the
 * bare ISO date to a JavaScript Date object on parse. The BLOCKER regression
 * (SCHEMA-FROZEN §4/§5) is that setFindingCell / setFrontmatterDecision do NOT
 * corrupt the date line when writing — they operate on raw lines, never calling
 * matter.stringify. The disk assertions below verify the quoted form is preserved.
 */
function _makeCardContent(options: {
  decision?: string;
  p1Routing?: string;
  p1Status?: string;
  p2Routing?: string;
  p2Status?: string;
} = {}): string {
  const {
    decision = "pending",
    p1Routing = "project",
    p1Status = "pending",
    p2Routing = "**framework**",
    p2Status = "pending",
  } = options;

  return [
    "---",
    "project: sie_v2",
    "source: RETRO-2026-06-06",
    'date: "2026-06-06"',   // quoted to prevent js-yaml Date coercion on parse
    `decision: ${decision}`,
    "applied: false",
    "tags:",
    "  - retro-triage",
    "---",
    "",
    "| # | Finding | Routing | Target file | Severity | Status |",
    "|---|---------|---------|-------------|----------|--------|",
    `| P1 | Backend dev agent misses edge | ${p1Routing} | \`agents/x.md\` | HIGH | ${p1Status} |`,
    `| P2 | Framework drift | ${p2Routing} | \`agents/y.md\` | MED | ${p2Status} |`,
    "",
    "## Decisions & rationale",
    "",
    "Addressed in this cycle.",
  ].join("\n");
}

/** Writes the fixture card to the temp vault and returns its content. */
async function _setupCard(content?: string): Promise<string> {
  const cardContent = content ?? _makeCardContent();
  await fs.writeFile(path.join(triageDir, CARD_FILENAME), cardContent, "utf-8");
  return cardContent;
}

/** Reads the card from disk after a write action. */
async function _readCard(): Promise<string> {
  return fs.readFile(path.join(triageDir, CARD_FILENAME), "utf-8");
}

// ===========================================================================
// routeFinding
// ===========================================================================

describe("routeFinding — sets routing cell (col 2) for a known finding_id", () => {
  it("should return a TriageDoc with the updated routing when finding_id and routing are valid", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await routeFinding({
      id: CARD_ID,
      finding_id: "P1",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert — result is a TriageDoc, not a sentinel
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST" || typeof result !== "object" || !("findings" in result)) return;
    // Routing updated
    const p1 = result.findings.find((f: { id: string | null }) => f.id === "P1");
    expect(p1).toBeDefined();
    expect(p1!.routing).toBe("framework");
  });

  it("should write the updated routing to disk (disk truth assertion)", async () => {
    // Arrange
    await _setupCard();

    // Act
    await routeFinding({
      id: CARD_ID,
      finding_id: "P1",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert — read the actual file from disk
    const onDisk = await _readCard();
    const targetLine = onDisk.split("\n").find((l) => l.includes("| P1 |"))!;
    const parts = targetLine.split("|");
    expect(parts[3]?.trim()).toBe("framework"); // col 2 → split-index 3
  });

  it("should return a TriageDoc that matches the actual disk content (re-read = disk truth)", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await routeFinding({
      id: CARD_ID,
      finding_id: "P1",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert — the returned doc must match what parseTriageDoc gives for the on-disk content
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST") return;

    const onDisk = await _readCard();
    const expectedDoc = { id: CARD_ID, ...parseTriageDoc(onDisk) };
    expect(result).toEqual(expectedDoc);
  });

  it("should preserve the date field as a plain string (BLOCKER: no ISO coercion)", async () => {
    // Arrange
    await _setupCard();

    // Act
    await routeFinding({
      id: CARD_ID,
      finding_id: "P1",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert — on-disk date line is verbatim; NOT an ISO timestamp
    const onDisk = await _readCard();
    expect(onDisk).toContain('date: "2026-06-06"');  // quoted form preserved verbatim by raw-line write
    expect(onDisk).not.toMatch(/date:.*T00:00:00/);  // no ISO coercion by matter.stringify
  });

  it("should NOT change P2 routing when only P1 is targeted (byte preservation)", async () => {
    // Arrange — P2 has **framework** bold routing
    await _setupCard();

    // Act
    await routeFinding({
      id: CARD_ID,
      finding_id: "P1",
      routing: "project",
      vaultRoot: tempVaultRoot,
    });

    // Assert — P2 row is unchanged (original **framework** preserved)
    const onDisk = await _readCard();
    const p2Line = onDisk.split("\n").find((l) => l.includes("| P2 |"))!;
    expect(p2Line.split("|")[3]).toBe(" **framework** "); // bold preserved
  });
});

describe("routeFinding — NOT_FOUND for unknown card", () => {
  it("should return NOT_FOUND when the card file does not exist", async () => {
    // Arrange — no card file written

    // Act
    const result = await routeFinding({
      id: "2026-01-01-nonexistent",
      finding_id: "P1",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

describe("routeFinding — NOT_FOUND for unknown finding_id", () => {
  it("should return NOT_FOUND when finding_id does not match any table row", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await routeFinding({
      id: CARD_ID,
      finding_id: "P99",  // no such row
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });

  it("should NOT write to disk when finding_id is unknown (no partial file mutation)", async () => {
    // Arrange
    const originalContent = await _setupCard();

    // Act
    await routeFinding({
      id: CARD_ID,
      finding_id: "P99",
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert — file content unchanged
    const onDisk = await _readCard();
    expect(onDisk).toBe(originalContent);
  });
});

describe("routeFinding — BAD_REQUEST when finding_id is absent", () => {
  it("should return BAD_REQUEST when finding_id is not provided (card has no single routing)", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await routeFinding({
      id: CARD_ID,
      finding_id: undefined,
      routing: "framework",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });
});

// ===========================================================================
// deferTriage — finding-level (col 5 → "deferred")
// ===========================================================================

describe("deferTriage — finding-level: sets status cell to 'deferred'", () => {
  it("should set P1 status to 'deferred' when finding_id is provided", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await deferTriage({
      id: CARD_ID,
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert — P1 status updated
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST" || typeof result !== "object" || !("findings" in result)) return;
    const p1 = result.findings.find((f: { id: string | null }) => f.id === "P1");
    expect(p1!.status).toBe("deferred");
  });

  it("should write 'deferred' status to disk (col 5, split-index 6)", async () => {
    // Arrange
    await _setupCard();

    // Act
    await deferTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — disk content has "deferred" in the P1 row status cell
    const onDisk = await _readCard();
    const p1Line = onDisk.split("\n").find((l) => l.includes("| P1 |"))!;
    expect(p1Line.split("|")[6]?.trim()).toBe("deferred"); // col 5 → split-index 6
  });

  it("should NOT change P2 status when only P1 is deferred", async () => {
    // Arrange
    await _setupCard();

    // Act
    await deferTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — P2 status unchanged
    const onDisk = await _readCard();
    const p2Line = onDisk.split("\n").find((l) => l.includes("| P2 |"))!;
    expect(p2Line.split("|")[6]?.trim()).toBe("pending"); // original
  });

  it("should preserve date on disk after finding-level defer (BLOCKER regression guard)", async () => {
    // Arrange
    await _setupCard();

    // Act
    await deferTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert
    const onDisk = await _readCard();
    expect(onDisk).toContain('date: "2026-06-06"');  // quoted form preserved verbatim by raw-line write
    expect(onDisk).not.toMatch(/date:.*T00:00:00/);  // no ISO coercion by matter.stringify
  });

  it("should return NOT_FOUND when finding_id does not match any row", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await deferTriage({ id: CARD_ID, finding_id: "P99", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// deferTriage — card-level (frontmatter decision → "deferred")
// ===========================================================================

describe("deferTriage — card-level: sets frontmatter decision to 'deferred'", () => {
  it("should set frontmatter decision to 'deferred' when no finding_id is provided", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    const result = await deferTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert — decision updated
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST" || typeof result !== "object" || !("decision" in result)) return;
    expect(result.decision).toBe("deferred");
  });

  it("should write 'deferred' to the decision frontmatter field on disk", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    await deferTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert — disk content has updated decision
    const onDisk = await _readCard();
    const decisionLine = onDisk.split("\n").find((l) => l.startsWith("decision:"))!;
    expect(decisionLine.trim()).toBe("decision: deferred");
  });

  it("should preserve the date line on disk after card-level defer (BLOCKER regression guard)", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    await deferTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert — date is verbatim, NOT ISO-coerced
    const onDisk = await _readCard();
    expect(onDisk).toContain('date: "2026-06-06"');  // quoted form preserved verbatim by raw-line write
    expect(onDisk).not.toMatch(/date:.*T00:00:00/);  // no ISO coercion by matter.stringify
  });

  it("should return NOT_FOUND when the card file does not exist", async () => {
    // Arrange — no file written

    // Act
    const result = await deferTriage({
      id: "2026-01-01-nonexistent",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// rejectTriage — finding-level (col 5 → "rejected")
// ===========================================================================

describe("rejectTriage — finding-level: sets status cell to 'rejected'", () => {
  it("should set P1 status to 'rejected' when finding_id is provided", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await rejectTriage({
      id: CARD_ID,
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST" || typeof result !== "object" || !("findings" in result)) return;
    const p1 = result.findings.find((f: { id: string | null }) => f.id === "P1");
    expect(p1!.status).toBe("rejected");
  });

  it("should write 'rejected' status to disk for the targeted finding", async () => {
    // Arrange
    await _setupCard();

    // Act
    await rejectTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert
    const onDisk = await _readCard();
    const p1Line = onDisk.split("\n").find((l) => l.includes("| P1 |"))!;
    expect(p1Line.split("|")[6]?.trim()).toBe("rejected");
  });

  it("should return NOT_FOUND when finding_id does not match any row", async () => {
    // Arrange
    await _setupCard();

    // Act
    const result = await rejectTriage({ id: CARD_ID, finding_id: "P99", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// rejectTriage — card-level (frontmatter decision → "rejected")
// ===========================================================================

describe("rejectTriage — card-level: sets frontmatter decision to 'rejected'", () => {
  it("should set frontmatter decision to 'rejected' when no finding_id is provided", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    const result = await rejectTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (result === "NOT_FOUND" || result === "BAD_REQUEST" || typeof result !== "object" || !("decision" in result)) return;
    expect(result.decision).toBe("rejected");
  });

  it("should write 'rejected' to the frontmatter decision field on disk", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    await rejectTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert
    const onDisk = await _readCard();
    const decisionLine = onDisk.split("\n").find((l) => l.startsWith("decision:"))!;
    expect(decisionLine.trim()).toBe("decision: rejected");
  });

  it("should preserve the date line after card-level reject (BLOCKER regression guard)", async () => {
    // Arrange
    await _setupCard(_makeCardContent({ decision: "pending" }));

    // Act
    await rejectTriage({ id: CARD_ID, vaultRoot: tempVaultRoot });

    // Assert
    const onDisk = await _readCard();
    expect(onDisk).toContain('date: "2026-06-06"');  // quoted form preserved verbatim by raw-line write
    expect(onDisk).not.toMatch(/date:.*T00:00:00/);  // no ISO coercion by matter.stringify
  });

  it("should return NOT_FOUND when the card file does not exist", async () => {
    // Arrange — no file written

    // Act
    const result = await rejectTriage({
      id: "2026-01-01-nonexistent",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});
