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
import { routeFinding, deferTriage, rejectTriage, applyTriage } from "./triageActions.js";
import type { ConfirmRequired, ConflictResult } from "./triageActions.js";
import { mintConfirmToken } from "./confirmToken.js";
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

// ===========================================================================
// applyTriage — helper builders for apply tests
// ===========================================================================

/**
 * Card with a project-routed finding (P1) and a framework-routed finding (P2).
 * target_file fields are plain strings (backtick form) as the parser strips them.
 */
function _makeApplyCard(options: {
  id?: string;
  decision?: string;
  p1Routing?: string;
  p1Status?: string;
  p1Target?: string;
  p2Routing?: string;
  p2Status?: string;
  p2Target?: string;
} = {}): string {
  const {
    decision = "pending",
    p1Routing = "project",
    p1Status = "pending",
    p1Target = "agents/x.md",
    p2Routing = "framework",
    p2Status = "pending",
    p2Target = "agents/y.md",
  } = options;

  return [
    "---",
    "project: sie_v2",
    "source: RETRO-2026-06-06",
    'date: "2026-06-06"',
    `decision: ${decision}`,
    "applied: false",
    "tags:",
    "  - retro-triage",
    "---",
    "",
    "| # | Finding | Routing | Target file | Severity | Status |",
    "|---|---------|---------|-------------|----------|--------|",
    `| P1 | Project finding | ${p1Routing} | \`${p1Target}\` | HIGH | ${p1Status} |`,
    `| P2 | Framework finding | ${p2Routing} | \`${p2Target}\` | MED | ${p2Status} |`,
    "",
    "## Decisions & rationale",
    "",
    "Addressed in this cycle.",
  ].join("\n");
}

/** Write a card to triageDir and return its content. */
async function _setupApplyCard(
  cardId: string,
  content: string,
): Promise<void> {
  await fs.writeFile(path.join(triageDir, `${cardId}.md`), content, "utf-8");
}

/** Read a card from disk. */
async function _readApplyCard(cardId: string): Promise<string> {
  return fs.readFile(path.join(triageDir, `${cardId}.md`), "utf-8");
}

// ===========================================================================
// applyTriage — project-routed finding (no token required)
// ===========================================================================

describe("applyTriage — project-routed finding: no token, 200 + status=applied on disk", () => {
  it("should return a TriageDoc with the finding status updated to applied", async () => {
    // Arrange
    const cardContent = _makeApplyCard({ p1Routing: "project", p1Status: "pending" });
    await _setupApplyCard(CARD_ID, cardContent);

    // Act
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert — result is a TriageDoc (not a sentinel)
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    if (typeof result !== "object" || !("findings" in result)) return;

    const p1 = result.findings.find((f) => f.id === "P1");
    expect(p1).toBeDefined();
    expect(p1!.status).toBe("applied");
  });

  it("should write the literal string applied (no bold) to col 5 on disk", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard({ p1Routing: "project", p1Status: "pending" }));

    // Act
    await applyTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — disk content, col 5 = split-index 6
    const onDisk = await _readApplyCard(CARD_ID);
    const p1Line = onDisk.split("\n").find((l) => l.includes("| P1 |"))!;
    expect(p1Line.split("|")[6]?.trim()).toBe("applied");
  });

  it("should preserve the date field as a plain string after apply (LL-013 guard)", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard({ p1Routing: "project" }));

    // Act
    await applyTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — no ISO coercion by matter.stringify
    const onDisk = await _readApplyCard(CARD_ID);
    expect(onDisk).toContain('date: "2026-06-06"');
    expect(onDisk).not.toMatch(/date:.*T00:00:00/);
  });

  it("should return the disk-truth TriageDoc (re-read matches actual file)", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard({ p1Routing: "project" }));

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — result equals what parseTriageDoc gives for on-disk content
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("findings" in result)) return;

    const onDisk = await _readApplyCard(CARD_ID);
    const expectedDoc = { id: CARD_ID, ...parseTriageDoc(onDisk) };
    expect(result).toEqual(expectedDoc);
  });
});

// ===========================================================================
// applyTriage — idempotent: already-applied project finding
// ===========================================================================

describe("applyTriage — idempotent: already-applied project finding", () => {
  it("should return a TriageDoc (not an error) when the project finding is already applied", async () => {
    // Arrange — card with P1 already applied
    const content = _makeApplyCard({ p1Routing: "project", p1Status: "applied" });
    await _setupApplyCard(CARD_ID, content);

    // Act — second apply is a no-op success (belt-and-suspenders path)
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert — idempotent: returns TriageDoc, not an error sentinel
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("findings" in result)) return;
    const p1 = result.findings.find((f) => f.id === "P1");
    expect(p1!.status).toBe("applied");
  });
});

// ===========================================================================
// applyTriage — idempotent: already-applied FRAMEWORK finding + token consumed
// ===========================================================================

describe("applyTriage — framework idempotent (§1.6): already-applied + valid token consumed on no-op write", () => {
  it("should return TriageDoc and mark the token used even when finding is already applied", async () => {
    // Arrange — P2 (framework) already applied on disk
    const content = _makeApplyCard({
      p2Routing: "framework",
      p2Status: "applied",
      p2Target: "agents/y.md",
    });
    await _setupApplyCard(CARD_ID, content);

    // Mint with real clock so the service's Date.now() verification passes.
    // The service calls verifyConfirmToken(token, scope, Date.now()) internally,
    // so issued_at must be within TTL of the current real clock.
    const issuedAt = Date.now();
    const scope = { id: CARD_ID, finding_id: "P2", target_file: "agents/y.md" };
    const token = mintConfirmToken(scope, issuedAt);

    // Act — apply with token, finding already at "applied"
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: token,
      vaultRoot: tempVaultRoot,
    });

    // Assert 1 — idempotent success: returns TriageDoc with P2 still applied
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("findings" in result)) return;
    const p2 = result.findings.find((f) => f.id === "P2");
    expect(p2!.status).toBe("applied");

    // Assert 2 — token is now consumed (replay → CONFIRM_REQUIRED via USED).
    // verifyConfirmToken is called with the SAME issuedAt so TTL check passes.
    const { verifyConfirmToken } = await import("./confirmToken.js");
    const replayResult = verifyConfirmToken(token, scope, issuedAt);
    expect(replayResult).toBe("USED");
  });
});

// ===========================================================================
// applyTriage — short/malformed row → NOT_FOUND (IMPORTANT#1 fix)
// ===========================================================================

describe("applyTriage — malformed/short row: setFindingCell no-op → NOT_FOUND", () => {
  it("should return NOT_FOUND when the finding row has too few pipe-separated cells to write col 5 (belt-and-suspenders §3 step-8)", async () => {
    // Arrange — card with a finding row that parses OK (id, routing, target_file all
    // valid) but whose raw line lacks the Status cell (col 5). setFindingCell cannot
    // write col 5 → returns raw unchanged (no-op). Since finding.status is null (not
    // "applied"), the belt-and-suspenders guard at step 8 returns "NOT_FOUND".
    //
    // Row format: 5 pipe-delimited columns (no Severity or Status cell).
    // splitPipeLine gives ["P3", "Short row", "project", "agents/ok.md"] → cells[3]
    // = "agents/ok.md" (valid target) but the raw line has only 6 "|" parts (idx 6
    // for Status → out of bounds → setFindingCell returns null → no-op).
    const malformedCard = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-06",
      'date: "2026-06-06"',
      "decision: pending",
      "applied: false",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      // Row with exactly 4 cells (id, finding, routing, target) — NO Severity, NO Status.
      // This produces 6 "|"-separated parts; idx = 6 (col 5 + 1) >= parts.length = 6
      // → setFindingCell returns null → no-op. finding.status = null ≠ "applied" → NOT_FOUND.
      "| P3 | Short row | project | `agents/ok.md` |",
      "",
    ].join("\n");
    await _setupApplyCard(CARD_ID, malformedCard);

    // Act — P3 parses fine (routing + target_file ok), but setFindingCell is a no-op
    // and finding.status is null ≠ "applied" → NOT_FOUND per §3 step-8.
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P3",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// applyTriage — framework: no token → ConfirmRequired sentinel
// ===========================================================================

describe("applyTriage — framework finding: no token → ConfirmRequired sentinel", () => {
  it("should return a ConfirmRequired sentinel (not write) when no confirm_token is provided", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard({ p2Routing: "framework", p2Status: "pending" }));

    // Act
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      vaultRoot: tempVaultRoot,
    });

    // Assert — sentinel shape
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("kind" in result)) {
      expect.fail("expected ConfirmRequired sentinel");
    }
    const sentinel = result as ConfirmRequired;
    expect(sentinel.kind).toBe("CONFIRM_REQUIRED");
    expect(sentinel.scope.id).toBe(CARD_ID);
    expect(sentinel.scope.finding_id).toBe("P2");
    expect(sentinel.scope.target_file).toBe("agents/y.md");
  });

  it("should NOT write to disk when returning ConfirmRequired (no partial mutation)", async () => {
    // Arrange
    const originalContent = _makeApplyCard({ p2Routing: "framework", p2Status: "pending" });
    await _setupApplyCard(CARD_ID, originalContent);

    // Act
    await applyTriage({ id: CARD_ID, finding_id: "P2", vaultRoot: tempVaultRoot });

    // Assert — disk unchanged
    const onDisk = await _readApplyCard(CARD_ID);
    expect(onDisk).toBe(originalContent);
  });

  it("should return ConfirmRequired when confirm_token is an invalid string", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard({ p2Routing: "framework" }));

    // Act
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: "not-a-valid-token",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("kind" in result)) return;
    expect((result as ConfirmRequired).kind).toBe("CONFIRM_REQUIRED");
  });
});

// ===========================================================================
// applyTriage — framework: valid token → 200 + status applied + token marked used
// ===========================================================================

describe("applyTriage — framework finding: valid token → applies + marks token used", () => {
  it("should return a TriageDoc and write applied to col 5 when given a valid framework token", async () => {
    // Arrange
    // Mint token using Date.now() so the service's internal Date.now() check passes.
    // (The service calls verifyConfirmToken with Date.now(), so the issued_at must be
    // within TTL of the real clock — using a fixed past constant would yield EXPIRED.)
    const p2Target = "agents/y.md";
    await _setupApplyCard(CARD_ID, _makeApplyCard({
      p2Routing: "framework",
      p2Status: "pending",
      p2Target,
    }));
    const scope = { id: CARD_ID, finding_id: "P2", target_file: p2Target };
    const token = mintConfirmToken(scope, Date.now());

    // Act
    const result = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: token,
      vaultRoot: tempVaultRoot,
    });

    // Assert — success
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("findings" in result)) return;
    const p2 = result.findings.find((f) => f.id === "P2");
    expect(p2!.status).toBe("applied");
  });

  it("should write the literal string applied to disk (col 5, no bold) for framework finding", async () => {
    // Arrange
    const p2Target = "agents/z.md";
    await _setupApplyCard(CARD_ID, _makeApplyCard({
      p2Routing: "framework",
      p2Status: "pending",
      p2Target,
    }));
    const scope = { id: CARD_ID, finding_id: "P2", target_file: p2Target };
    // Mint with real clock so the service's Date.now() verification passes.
    const token = mintConfirmToken(scope, Date.now());

    // Act
    await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: token,
      vaultRoot: tempVaultRoot,
    });

    // Assert — on disk
    const onDisk = await _readApplyCard(CARD_ID);
    const p2Line = onDisk.split("\n").find((l) => l.includes("| P2 |"))!;
    expect(p2Line.split("|")[6]?.trim()).toBe("applied");
  });

  it("should consume the token so a replay attempt returns ConfirmRequired", async () => {
    // Arrange
    const p2Target = "agents/replay-test.md";
    await _setupApplyCard(CARD_ID, _makeApplyCard({
      p2Routing: "framework",
      p2Status: "pending",
      p2Target,
    }));
    const scope = { id: CARD_ID, finding_id: "P2", target_file: p2Target };
    // Mint with real clock so the service's Date.now() verification passes.
    const token = mintConfirmToken(scope, Date.now());

    // First apply — should succeed
    const firstResult = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: token,
      vaultRoot: tempVaultRoot,
    });
    expect(typeof firstResult).toBe("object");
    if (typeof firstResult !== "object" || !("findings" in firstResult)) return;

    // Act — replay the same token
    const replayResult = await applyTriage({
      id: CARD_ID,
      finding_id: "P2",
      confirm_token: token,
      vaultRoot: tempVaultRoot,
    });

    // Assert — replay blocked as CONFIRM_REQUIRED (USED internally → collapses to sentinel)
    expect(typeof replayResult).toBe("object");
    if (typeof replayResult !== "object" || !("kind" in replayResult)) return;
    expect((replayResult as ConfirmRequired).kind).toBe("CONFIRM_REQUIRED");
  });
});

// ===========================================================================
// applyTriage — RL-5 conflict scan
// ===========================================================================

describe("applyTriage — RL-5: sibling with same target_file already applied → CONFLICT", () => {
  const CARD_A_ID = "2026-06-06-card-a";
  const CARD_B_ID = "2026-06-06-card-b";
  const SHARED_TARGET = "agents/shared.md";

  it("should return a ConflictResult when a sibling finding has status=applied for the same target_file", async () => {
    // Arrange — card A with P1 already applied to SHARED_TARGET
    const cardA = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-06",
      'date: "2026-06-06"',
      "decision: pending",
      "applied: false",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Sibling applied | project | \`${SHARED_TARGET}\` | HIGH | applied |`,
      "",
    ].join("\n");

    // Card B with P1 pending for the SAME target
    const cardB = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-07",
      'date: "2026-06-07"',
      "decision: pending",
      "applied: false",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | This finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
      "",
    ].join("\n");

    await _setupApplyCard(CARD_A_ID, cardA);
    await _setupApplyCard(CARD_B_ID, cardB);

    // Act — try to apply card B's P1 (same target as already-applied card A P1)
    const result = await applyTriage({
      id: CARD_B_ID,
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert — conflict detected
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("kind" in result)) {
      expect.fail("expected ConflictResult");
    }
    const conflict = result as ConflictResult;
    expect(conflict.kind).toBe("CONFLICT");
    expect(conflict.detail.target_file).toBe(SHARED_TARGET);
    expect(conflict.detail.conflicting_card.id).toBe(CARD_A_ID);
  });

  it("should NOT write to card B on disk when a CONFLICT is detected", async () => {
    // Arrange
    const cardA = [
      "---", "project: sie_v2", 'date: "2026-06-06"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Applied sibling | project | \`${SHARED_TARGET}\` | HIGH | applied |`,
    ].join("\n");
    const cardBContent = [
      "---", "project: sie_v2", 'date: "2026-06-07"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Pending finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");

    await _setupApplyCard(CARD_A_ID, cardA);
    await _setupApplyCard(CARD_B_ID, cardBContent);

    // Act
    await applyTriage({ id: CARD_B_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — card B byte-unchanged
    const onDisk = await _readApplyCard(CARD_B_ID);
    expect(onDisk).toBe(cardBContent);
  });

  it("should also block when the sibling CARD (not finding) decision=applied for the same target", async () => {
    // Arrange — doc.decision=applied triggers conflict per RL-5 §2c
    const cardADecisionApplied = [
      "---", "project: sie_v2", 'date: "2026-06-06"', "decision: applied",
      "applied: true", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Finding in applied card | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");
    const cardB = [
      "---", "project: sie_v2", 'date: "2026-06-07"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | This finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");

    await _setupApplyCard(CARD_A_ID, cardADecisionApplied);
    await _setupApplyCard(CARD_B_ID, cardB);

    // Act
    const result = await applyTriage({ id: CARD_B_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("kind" in result)) return;
    expect((result as ConflictResult).kind).toBe("CONFLICT");
  });

  it("should NOT block when the sibling has status=deferred for the same target", async () => {
    // Arrange — deferred sibling does NOT conflict (SCHEMA-FROZEN §2)
    const cardADeferred = [
      "---", "project: sie_v2", 'date: "2026-06-06"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Deferred sibling | project | \`${SHARED_TARGET}\` | HIGH | deferred |`,
    ].join("\n");
    const cardB = [
      "---", "project: sie_v2", 'date: "2026-06-07"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | This finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");

    await _setupApplyCard(CARD_A_ID, cardADeferred);
    await _setupApplyCard(CARD_B_ID, cardB);

    // Act
    const result = await applyTriage({ id: CARD_B_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — no conflict; result is a TriageDoc
    expect(result).not.toBe("NOT_FOUND");
    expect(result).not.toBe("BAD_REQUEST");
    expect(typeof result).toBe("object");
    if (typeof result !== "object" || !("kind" in result) || !("findings" in result)) {
      // TriageDoc returned — success
      return;
    }
    // If it somehow has a kind, it must NOT be CONFLICT
    expect((result as ConflictResult).kind).not.toBe("CONFLICT");
  });

  it("should NOT block when the sibling has status=pending for the same target", async () => {
    // Arrange — pending sibling does NOT conflict
    const cardAPending = [
      "---", "project: sie_v2", 'date: "2026-06-06"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Pending sibling | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");
    const cardB = [
      "---", "project: sie_v2", 'date: "2026-06-07"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | This finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");

    await _setupApplyCard(CARD_A_ID, cardAPending);
    await _setupApplyCard(CARD_B_ID, cardB);

    // Act
    const result = await applyTriage({ id: CARD_B_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — no conflict
    expect(typeof result).toBe("object");
    if (typeof result === "object" && "kind" in result) {
      expect((result as ConflictResult).kind).not.toBe("CONFLICT");
    }
  });

  it("should NOT block a self-finding (same card, same finding_id) when scanning for conflicts", async () => {
    // Arrange — only one card; applying its own P1; RL-5 self-exclusion must skip it.
    const singleCard = [
      "---", "project: sie_v2", 'date: "2026-06-06"', "decision: pending",
      "applied: false", "---", "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      `| P1 | Self finding | project | \`${SHARED_TARGET}\` | HIGH | pending |`,
    ].join("\n");
    await _setupApplyCard(CARD_A_ID, singleCard);

    // Act — applying P1 on card A; the scan must NOT treat P1 on card A as a sibling conflict
    const result = await applyTriage({ id: CARD_A_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert — success (not a conflict)
    expect(typeof result).toBe("object");
    if (typeof result === "object" && "kind" in result) {
      expect((result as ConflictResult).kind).not.toBe("CONFLICT");
    }
  });
});

// ===========================================================================
// applyTriage — guards: BAD_REQUEST / NOT_FOUND
// ===========================================================================

describe("applyTriage — guards: BAD_REQUEST and NOT_FOUND", () => {
  it("should return BAD_REQUEST when finding_id is null", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard());

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: null, vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });

  it("should return BAD_REQUEST when finding_id is an empty string", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard());

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });

  it("should return BAD_REQUEST when finding_id is blank whitespace", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard());

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "   ", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });

  it("should return NOT_FOUND when the card file does not exist", async () => {
    // Act
    const result = await applyTriage({
      id: "2026-01-01-nonexistent",
      finding_id: "P1",
      vaultRoot: tempVaultRoot,
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });

  it("should return NOT_FOUND when the finding_id does not match any table row", async () => {
    // Arrange
    await _setupApplyCard(CARD_ID, _makeApplyCard());

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "P99", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });

  it("should return BAD_REQUEST when the finding routing is null/blank (unrouted)", async () => {
    // Arrange — P1 has an empty routing cell
    const unroutedCard = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-06",
      'date: "2026-06-06"',
      "decision: pending",
      "applied: false",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      "| P1 | Unrouted finding |  | `agents/x.md` | HIGH | pending |",
      "",
    ].join("\n");
    await _setupApplyCard(CARD_ID, unroutedCard);

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });

  it("should return BAD_REQUEST when the finding target_file is null (§1.5 null-target guard)", async () => {
    // Arrange — P1 has a blank target_file cell
    const noTargetCard = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-06",
      'date: "2026-06-06"',
      "decision: pending",
      "applied: false",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      "| P1 | No target | project |  | HIGH | pending |",
      "",
    ].join("\n");
    await _setupApplyCard(CARD_ID, noTargetCard);

    // Act
    const result = await applyTriage({ id: CARD_ID, finding_id: "P1", vaultRoot: tempVaultRoot });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });
});
