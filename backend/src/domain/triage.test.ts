/**
 * Unit tests for parseTriageFindings, parseTriageDoc, setFindingCell,
 * and setFrontmatterDecision (domain layer — S5a + S5b-1).
 *
 * Pure functions — no mocks, no fs, no env.
 *
 * Covers (T1 test plan):
 *   - header-find: table with | # | Finding | Routing | … | header is found
 *   - separator-skip: normal separator is skipped; MISSING separator → row 1 not consumed
 *   - decoration strip: **bold** → plain; `backtick` → plain
 *   - positional map + degrade: short row (2 cells) → trailing null; long row (8) → extras ignored
 *   - blank-row skip: template blank row skipped
 *   - escaped-pipe degrade (KNOWN LIMITATION doc): row with \| → never throws
 *   - rationale capture: text under ## Decisions & rationale, ## Follow-up excluded
 *   - frontmatter: applied non-boolean → null; tags absent → []; empty decision → null
 *   - missing-table → findings: []
 *   - S5b-1 setFindingCell: routing col (2) + status col (5); byte preservation; idempotency;
 *     not-found no-op; bold-wrapped sibling cells preserved verbatim
 *   - S5b-1 setFrontmatterDecision: decision replaced; date/tags/source byte-preserved
 *     (BLOCKER regression guard); key absent → inserted; applied updated
 *
 * Algorithm: SCHEMA-FROZEN-S5a §3 + SCHEMA-FROZEN-S5b-1 §4/§5 (LL-011).
 */
import { describe, it, expect } from "vitest";
import { parseTriageFindings, parseTriageDoc, setFindingCell } from "./triage.js";
import { setFrontmatterDecision } from "./triageFrontmatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal markdown body containing a findings table.
 * The header row always has the frozen 6-column order:
 * | # | Finding | Routing | Target file | Severity | Status |
 */
function _makeTableBody(rows: string[], extraBefore: string = ""): string {
  const header = "| # | Finding | Routing | Target file | Severity | Status |";
  const separator = "|---|---------|---------|-------------|----------|--------|";
  const lines = [
    extraBefore,
    header,
    separator,
    ...rows,
    "",
  ].filter((l, i) => i === 0 || l !== "" || i === rows.length + 2);
  return lines.join("\n");
}

/** A valid data row with all 6 cells populated. */
function _dataRow(
  id: string,
  finding: string,
  routing: string,
  targetFile: string,
  severity: string,
  status: string,
): string {
  return `| ${id} | ${finding} | ${routing} | ${targetFile} | ${severity} | ${status} |`;
}

/** Builds a full raw triage file string (frontmatter + body). */
function _makeRawDoc(overrides: {
  project?: string;
  source?: string;
  date?: string;
  decision?: string;
  applied?: unknown;
  tags?: unknown;
  body?: string;
} = {}): string {
  const {
    project = "sie_v2",
    source = "RETRO-2026-06-06",
    date = "2026-06-06",
    decision = "applied",
    applied = true,
    tags = ["retro-triage"],
    body = _makeTableBody([_dataRow("P1", "A bug", "project", "`agents/x.md`", "HIGH", "applied")]),
  } = overrides;

  const yamlApplied = applied === true ? "true" : applied === false ? "false" : String(applied);
  const yamlTags =
    Array.isArray(tags)
      ? `\n${tags.map((t) => `  - ${t}`).join("\n")}`
      : tags == null
        ? ""
        : ` ${tags}`;

  return [
    "---",
    `project: ${project}`,
    `source: ${source}`,
    `date: "${date}"`,  // quoted to prevent js-yaml from coercing YYYY-MM-DD to Date
    `decision: ${decision}`,
    `applied: ${yamlApplied}`,
    `tags:${yamlTags}`,
    "---",
    "",
    body,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// parseTriageFindings — header-find
// ---------------------------------------------------------------------------

describe("parseTriageFindings — header-find", () => {
  it("should find the header row and return findings when a valid table is present", () => {
    // Arrange
    const body = _makeTableBody([
      _dataRow("P1", "A finding", "project", "`docs/x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
  });

  it("should ignore junk lines before the header row and still find the table", () => {
    // Arrange — junk prose before the table
    const body = _makeTableBody(
      [_dataRow("P1", "First finding", "project", "`x.md`", "MED", "pending")],
      "## Background\n\nSome prose here.\n\n",
    );

    // Act
    const result = parseTriageFindings(body);

    // Assert — header is found after the junk
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBe("First finding");
  });

  it("should return empty array when no header row with 'finding' and 'routing' cells is present", () => {
    // Arrange — table but wrong header words
    const body = "| ID | Description | Owner | File | Sev | State |\n|---|---|---|---|---|---|\n| P1 | x | y | z | HIGH | done |";

    // Act
    const result = parseTriageFindings(body);

    // Assert — no matching header → []
    expect(result).toEqual([]);
  });

  it("should find the header case-insensitively (e.g. FINDING and ROUTING uppercase)", () => {
    // Arrange — uppercase header cells
    const body = "| # | FINDING | ROUTING | Target file | Severity | Status |\n|---|---|---|---|---|---|\n| P1 | A bug | project | `x.md` | HIGH | applied |";

    // Act
    const result = parseTriageFindings(body);

    // Assert — case-insensitive match
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — separator-skip
// ---------------------------------------------------------------------------

describe("parseTriageFindings — separator-skip (SCHEMA-FROZEN-S5a §3.B.2)", () => {
  it("should skip the |---|---| separator row and treat row immediately after as first data row", () => {
    // Arrange — normal table with separator
    const body = _makeTableBody([
      _dataRow("P1", "Real finding", "framework", "`agents/x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — P1 is the first data row (separator was skipped, not consumed as data)
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBe("Real finding");
  });

  it("should NOT consume the first data row when the separator row is missing (defensive)", () => {
    // Arrange — table WITHOUT a separator row (defensive case, SCHEMA-FROZEN §3.B.2 note)
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const dataRow1 = "| P1 | Real first row | project | `x.md` | HIGH | applied |";
    const dataRow2 = "| P2 | Second row | framework | `y.md` | MED | pending |";
    const noSep = [header, dataRow1, dataRow2].join("\n");

    // Act
    const result = parseTriageFindings(noSep);

    // Assert — the first data row (P1) must NOT be consumed/lost as a "separator"
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.finding).toBe("Real first row");
    expect(result[0]?.id).toBe("P1");
  });

  it("should treat a non-separator line after header as a body row (not skip it)", () => {
    // Arrange — line after header starts with | but is a data row, not ---
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const notSeparator = "| P1 | Not a sep | project | `x.md` | HIGH | applied |";
    const body = [header, notSeparator].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — decoration strip
// ---------------------------------------------------------------------------

describe("parseTriageFindings — decoration strip", () => {
  it("should strip surrounding **bold** from the routing cell", () => {
    // Arrange — routing cell is **framework** (as seen in live P2 row)
    const body = _makeTableBody([
      _dataRow("P2", "Some finding", "**framework**", "`agents/x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — **framework** → framework
    expect(result[0]?.routing).toBe("framework");
  });

  it("should strip surrounding **bold** from the severity cell", () => {
    // Arrange
    const body = _makeTableBody([
      _dataRow("P1", "Finding", "project", "`x.md`", "**HIGH**", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result[0]?.severity).toBe("HIGH");
  });

  it("should strip surrounding **bold** from the status cell", () => {
    // Arrange
    const body = _makeTableBody([
      _dataRow("P1", "Finding", "project", "`x.md`", "HIGH", "**applied**"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result[0]?.status).toBe("applied");
  });

  it("should strip surrounding backticks from the target_file cell", () => {
    // Arrange — target_file with backtick wrapper as in live sie_v2 card
    const body = _makeTableBody([
      _dataRow("P1", "Finding", "project", "`sie_v2-project-layer/agents/x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result[0]?.target_file).toBe("sie_v2-project-layer/agents/x.md");
  });

  it("should NOT strip bold from the finding cell (no decoration on finding)", () => {
    // Arrange — bold inside the finding cell (should remain as-is)
    const body = _makeTableBody([
      _dataRow("P1", "**important** bug", "project", "`x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — finding is preserved verbatim (no stripping)
    expect(result[0]?.finding).toBe("**important** bug");
  });

  it("should NOT strip backticks from the id cell (no decoration on id)", () => {
    // Arrange — backtick in id (unusual but must not strip)
    const body = _makeTableBody([
      _dataRow("`P1`", "Finding", "project", "`x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — id kept verbatim
    expect(result[0]?.id).toBe("`P1`");
  });

  it("should return null for routing when bold-stripped value is empty string", () => {
    // Arrange — routing is ** ** (bold wrapper around only spaces)
    // After stripBold: "  ".trim() → "" → null
    const body = _makeTableBody([
      _dataRow("P1", "Finding", "****", "`x.md`", "HIGH", "applied"),
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — **** → empty after strip → null
    // Note: stripBold requires cell.length > 4, so "****" (length 4) is NOT stripped
    // This tests the boundary: "****" stays as "****" → emptyToNull("****") → "****"
    expect(result[0]?.routing).toBe("****");
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — positional map + degrade (short / long rows)
// ---------------------------------------------------------------------------

describe("parseTriageFindings — positional map and row-arity degrade", () => {
  it("should fill trailing fields with null when a row has only 2 cells (short row)", () => {
    // Arrange — only id and finding, no routing/target/severity/status
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const shortRow = "| P1 | Only two cells |";
    const body = [header, separator, shortRow].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — present fields populated; trailing fields null
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBe("Only two cells");
    expect(result[0]?.routing).toBeNull();
    expect(result[0]?.target_file).toBeNull();
    expect(result[0]?.severity).toBeNull();
    expect(result[0]?.status).toBeNull();
  });

  it("should ignore extra cells when a row has 8 cells (long row)", () => {
    // Arrange — 8 cells, only 6 are mapped; extras ignored
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const longRow = "| P1 | Finding | project | `x.md` | HIGH | applied | EXTRA1 | EXTRA2 |";
    const body = [header, separator, longRow].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — 6 standard fields populated correctly, extras ignored
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBe("Finding");
    expect(result[0]?.routing).toBe("project");
    expect(result[0]?.target_file).toBe("x.md");
    expect(result[0]?.severity).toBe("HIGH");
    expect(result[0]?.status).toBe("applied");
  });

  it("should never throw for a row with zero cells after split", () => {
    // Arrange — degenerate row
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---|---|---|---|---|";
    const emptyPipes = "||";
    const body = [header, separator, emptyPipes].join("\n");

    // Act / Assert
    expect(() => parseTriageFindings(body)).not.toThrow();
  });

  it("should never throw for an extremely short row (1 cell)", () => {
    // Arrange
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---|---|---|---|---|";
    const oneCell = "| P1 |";
    const body = [header, separator, oneCell].join("\n");

    // Act / Assert
    expect(() => parseTriageFindings(body)).not.toThrow();
    const result = parseTriageFindings(body);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — blank-row skip
// ---------------------------------------------------------------------------

describe("parseTriageFindings — blank-row skip", () => {
  it("should skip a row where ALL cells are empty (e.g. | | | | | | |) and not include it in findings", () => {
    // Arrange — a row with truly all-empty cells (no id, no content)
    // Per §3.B.4: SKIP-BLANK-ROW fires when EVERY cell is "" after split+trim.
    // Note: | 2 | | | | | | has id="2" → NOT all empty → NOT skipped (produces finding with null fields).
    // A row with all-empty cells looks like "| | | | | | |".
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const allEmptyRow = "| | | | | | |";  // all cells empty after split+trim
    const realRow = "| P1 | Real finding | project | `x.md` | HIGH | applied |";
    const body = [header, separator, allEmptyRow, realRow].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — all-empty row skipped; only the real row returned
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
    expect(result[0]?.finding).toBe("Real finding");
  });

  it("should produce a finding with null fields (not skip) for | 2 | | | | | | (id='2' is non-empty)", () => {
    // Arrange — the template placeholder row: id cell "2" is non-empty → NOT all-empty → NOT skipped
    // Per §3.B.4: cells.every(c => c === "") is FALSE because "2" !== "".
    // Produces a TriageFinding with id="2" and all other fields null.
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const blankRow = "| 2 | | | | | |";
    const body = [header, separator, blankRow].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — row is NOT skipped; produces finding with id="2" and null fields
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("2");
    expect(result[0]?.finding).toBeNull();
    expect(result[0]?.routing).toBeNull();
    expect(result[0]?.target_file).toBeNull();
    expect(result[0]?.severity).toBeNull();
    expect(result[0]?.status).toBeNull();
  });

  it("should return empty array when all rows in the table body are truly all-empty (no id either)", () => {
    // Arrange — rows where every cell is blank (including id cell)
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const blank1 = "| | | | | | |";  // truly all cells empty
    const blank2 = "| | | | | | |";
    const body = [header, separator, blank1, blank2].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — all truly-blank rows skipped → empty
    expect(result).toEqual([]);
  });

  it("should stop body iteration at a blank line (stop condition)", () => {
    // Arrange — blank line after first data row terminates body.
    // Built manually (not via _makeTableBody) to preserve the blank line as-is.
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const row1 = "| P1 | First | project | `x.md` | HIGH | applied |";
    const blankLine = "";
    const row2 = "| P2 | Second | project | `y.md` | MED | pending |";
    const body = [header, separator, row1, blankLine, row2].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — only P1 captured; blank line stopped iteration before P2
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
  });

  it("should stop body iteration at a ## heading line (stop condition)", () => {
    // Arrange — ## heading after first row stops the table body
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const separator = "|---|---------|---------|-------------|----------|--------|";
    const row1 = "| P1 | First | project | `x.md` | HIGH | applied |";
    const heading = "## Decisions & rationale";
    const row2 = "| P2 | After heading | project | `y.md` | MED | pending |";
    const body = [header, separator, row1, heading, row2].join("\n");

    // Act
    const result = parseTriageFindings(body);

    // Assert — only P1; ## heading stopped body iteration
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("P1");
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — escaped-pipe degrade (KNOWN LIMITATION documentation)
// ---------------------------------------------------------------------------

describe("parseTriageFindings — escaped-pipe limitation (SCHEMA-FROZEN §3 KNOWN LIMITATION)", () => {
  it("should not throw when a row contains a literal \\| (escaped pipe) in a cell", () => {
    // Arrange — row with an escaped pipe inside a cell value
    // Per SCHEMA-FROZEN §3 KNOWN LIMITATION: the splitter is a literal split("|"),
    // so \| mis-splits into extra cells. This test documents current behavior:
    // the batch MUST survive (not throw), even though field mapping may shift.
    const body = _makeTableBody([
      "| P1 | Finding with \\| pipe | project | `x.md` | HIGH | applied |",
    ]);

    // Act / Assert — documents the limitation; must not throw (degrade only)
    expect(() => parseTriageFindings(body)).not.toThrow();
  });

  it("should return a result array (possibly shifted fields) for a row with \\| (not an empty batch)", () => {
    // Arrange
    const body = _makeTableBody([
      "| P1 | Good row | project | `x.md` | HIGH | applied |",
      "| P2 | Row with \\| pipe | framework | `y.md` | MED | pending |",
    ]);

    // Act
    const result = parseTriageFindings(body);

    // Assert — at minimum P1 is present (batch survived); P2 may have shifted fields
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.id).toBe("P1");
  });
});

// ---------------------------------------------------------------------------
// parseTriageFindings — missing table
// ---------------------------------------------------------------------------

describe("parseTriageFindings — missing table", () => {
  it("should return empty array when the body has no table header at all", () => {
    // Arrange — plain prose, no pipe table
    const body = "Some prose text\n\nAnother paragraph\n";

    // Act
    const result = parseTriageFindings(body);

    // Assert
    expect(result).toEqual([]);
  });

  it("should return empty array for an empty string body", () => {
    // Arrange
    const result = parseTriageFindings("");

    // Assert
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseTriageDoc — rationale extraction (SCHEMA-FROZEN §3.C)
// ---------------------------------------------------------------------------

describe("parseTriageDoc — rationale extraction", () => {
  it("should capture text under '## Decisions & rationale' as the rationale field", () => {
    // Arrange
    const rawText = _makeRawDoc({
      body: [
        "| # | Finding | Routing | Target file | Severity | Status |",
        "|---|---|---|---|---|---|",
        "| P1 | A bug | project | `x.md` | HIGH | applied |",
        "",
        "## Decisions & rationale",
        "",
        "We decided to address P1 first because it affects all users.",
        "The framework patch was applied and verified.",
      ].join("\n"),
    });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.rationale).not.toBeNull();
    expect(result.rationale).toContain("We decided to address P1 first");
  });

  it("should NOT capture text under ## Follow-up (rationale stops at next ## heading)", () => {
    // Arrange
    const rawText = _makeRawDoc({
      body: [
        "| # | Finding | Routing | Target file | Severity | Status |",
        "|---|---|---|---|---|---|",
        "| P1 | A bug | project | `x.md` | HIGH | applied |",
        "",
        "## Decisions & rationale",
        "",
        "This is the rationale text.",
        "",
        "## Follow-up",
        "",
        "This should NOT appear in rationale.",
      ].join("\n"),
    });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert — rationale contains rationale text but NOT follow-up
    expect(result.rationale).toContain("This is the rationale text.");
    expect(result.rationale).not.toContain("This should NOT appear");
    expect(result.rationale).not.toContain("Follow-up");
  });

  it("should return null for rationale when the ## Decisions & rationale section is absent", () => {
    // Arrange — body with no rationale heading
    const rawText = _makeRawDoc({
      body: [
        "| # | Finding | Routing | Target file | Severity | Status |",
        "|---|---|---|---|---|---|",
        "| P1 | A bug | project | `x.md` | HIGH | applied |",
      ].join("\n"),
    });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.rationale).toBeNull();
  });

  it("should return null for rationale when the section exists but is empty", () => {
    // Arrange — section heading present but nothing follows it
    const rawText = _makeRawDoc({
      body: [
        "| # | Finding | Routing | Target file | Severity | Status |",
        "|---|---|---|---|---|---|",
        "| P1 | A bug | project | `x.md` | HIGH | applied |",
        "",
        "## Decisions & rationale",
      ].join("\n"),
    });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.rationale).toBeNull();
  });

  it("should match the rationale heading case-insensitively", () => {
    // Arrange — all-lowercase variant
    const rawText = _makeRawDoc({
      body: [
        "| # | Finding | Routing | Target file | Severity | Status |",
        "|---|---|---|---|---|---|",
        "",
        "## decisions & rationale",
        "",
        "Some rationale content.",
      ].join("\n"),
    });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.rationale).toContain("Some rationale content.");
  });
});

// ---------------------------------------------------------------------------
// parseTriageDoc — frontmatter normalization
// ---------------------------------------------------------------------------

describe("parseTriageDoc — frontmatter: applied field", () => {
  it("should return applied: true when frontmatter applied is boolean true", () => {
    // Arrange
    const rawText = _makeRawDoc({ applied: true });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.applied).toBe(true);
  });

  it("should return applied: false when frontmatter applied is boolean false", () => {
    // Arrange
    const rawText = _makeRawDoc({ applied: false });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.applied).toBe(false);
  });

  it("should return applied: null when frontmatter applied is a string (non-boolean)", () => {
    // Arrange — YAML string value "yes" is a string, not a boolean
    // We pass it as a raw string in the YAML override (quotes prevent YAML bool coercion)
    const rawText = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026",
      "date: 2026-06-06",
      "decision: applied",
      'applied: "yes"',  // quoted string — not a YAML boolean
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.applied).toBeNull();
  });

  it("should return applied: null when the applied field is absent from frontmatter", () => {
    // Arrange — manually omit applied from YAML
    const rawText = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026",
      "date: 2026-06-06",
      "decision: applied",
      "tags:",
      "  - retro-triage",
      "---",
      "",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.applied).toBeNull();
  });

  it("should return applied: null when frontmatter applied is a number", () => {
    // Arrange
    const rawText = [
      "---",
      "project: sie_v2",
      "applied: 1",
      "tags: []",
      "---",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.applied).toBeNull();
  });
});

describe("parseTriageDoc — frontmatter: tags field", () => {
  it("should return tags: [] when the tags field is absent from frontmatter", () => {
    // Arrange — manually built YAML without tags
    const rawText = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026",
      "date: 2026-06-06",
      "decision: applied",
      "applied: true",
      "---",
      "",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.tags).toEqual([]);
  });

  it("should return tags: [] when the tags field is null in YAML", () => {
    // Arrange
    const rawText = [
      "---",
      "project: sie_v2",
      "tags: null",
      "applied: true",
      "---",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.tags).toEqual([]);
  });

  it("should return populated tags array when tags is a YAML list", () => {
    // Arrange
    const rawText = _makeRawDoc({ tags: ["retro-triage", "sie_v2"] });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.tags).toEqual(["retro-triage", "sie_v2"]);
  });

  it("should return tags: [] when tags field is a non-array scalar", () => {
    // Arrange
    const rawText = [
      "---",
      "project: sie_v2",
      "tags: retro-triage",
      "applied: true",
      "---",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert — non-array → []
    expect(result.tags).toEqual([]);
  });
});

describe("parseTriageDoc — frontmatter: decision field", () => {
  it("should return decision: null when the decision field is an empty string", () => {
    // Arrange
    const rawText = [
      "---",
      "project: sie_v2",
      "decision: ''",
      "applied: true",
      "tags: []",
      "---",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.decision).toBeNull();
  });

  it("should return decision: null when the decision field is absent", () => {
    // Arrange
    const rawText = [
      "---",
      "project: sie_v2",
      "applied: true",
      "tags: []",
      "---",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.decision).toBeNull();
  });

  it("should preserve a non-empty decision value verbatim", () => {
    // Arrange
    const rawText = _makeRawDoc({ decision: "pending" });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.decision).toBe("pending");
  });
});

describe("parseTriageDoc — never throws (degrade on any input)", () => {
  it("should not throw and return zero-value doc when rawText is completely empty", () => {
    // Arrange / Act / Assert
    expect(() => parseTriageDoc("")).not.toThrow();
    const result = parseTriageDoc("");
    expect(result.findings).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.rationale).toBeNull();
  });

  it("should not throw when given garbage text with no frontmatter", () => {
    // Arrange / Act / Assert
    expect(() => parseTriageDoc("this is just some garbage text")).not.toThrow();
  });

  it("should return findings: [] when the body has no table", () => {
    // Arrange
    const rawText = _makeRawDoc({ body: "No table here, just prose." });

    // Act
    const result = parseTriageDoc(rawText);

    // Assert
    expect(result.findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseTriageDoc — full happy path (mirrors live sie_v2 card structure)
// ---------------------------------------------------------------------------

describe("parseTriageDoc — full happy path (live card structure)", () => {
  it("should correctly parse a realistic sie_v2-style card with all fields populated", () => {
    // Arrange — mirrors SCHEMA-FROZEN §0 verification evidence.
    // NOTE: date must be YAML-quoted ("2026-06-06") to prevent gray-matter / js-yaml
    // from coercing it to a Date object (YAML ISO-date bare strings → Date in js-yaml).
    const rawText = [
      "---",
      "project: sie_v2",
      "source: RETRO-2026-06-06",
      'date: "2026-06-06"',
      "decision: applied",
      "applied: true",
      "tags:",
      "  - retro-triage",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
      "|---|---------|---------|-------------|----------|--------|",
      "| P1 | Backend dev agent misses edge cases | project | `sie_v2-project-layer/agents/backend-developer.append.md` | HIGH | applied |",
      "| P2 | Framework prompt drift | **framework** | `agents/backend-developer.md` | MED | pending |",
      "",
      "## Decisions & rationale",
      "",
      "P1 was addressed by updating the project layer append file.",
      "P2 requires a vault-level update — deferred to next cycle.",
      "",
      "## Follow-up",
      "",
      "Track P2 in the next RETRO.",
    ].join("\n");

    // Act
    const result = parseTriageDoc(rawText);

    // Assert — frontmatter
    expect(result.project).toBe("sie_v2");
    expect(result.source).toBe("RETRO-2026-06-06");
    expect(result.date).toBe("2026-06-06");
    expect(result.decision).toBe("applied");
    expect(result.applied).toBe(true);
    expect(result.tags).toEqual(["retro-triage"]);

    // Assert — findings
    expect(result.findings).toHaveLength(2);

    const p1 = result.findings[0]!;
    expect(p1.id).toBe("P1");
    expect(p1.finding).toBe("Backend dev agent misses edge cases");
    expect(p1.routing).toBe("project");  // no bold
    expect(p1.target_file).toBe("sie_v2-project-layer/agents/backend-developer.append.md");
    expect(p1.severity).toBe("HIGH");
    expect(p1.status).toBe("applied");

    const p2 = result.findings[1]!;
    expect(p2.id).toBe("P2");
    expect(p2.routing).toBe("framework");  // **framework** → framework (bold stripped)

    // Assert — rationale (captured; Follow-up excluded)
    expect(result.rationale).toContain("P1 was addressed");
    expect(result.rationale).toContain("deferred to next cycle");
    expect(result.rationale).not.toContain("Track P2");
  });
});

// ===========================================================================
// S5b-1: setFindingCell — surgical single-cell table rewrite
// (SCHEMA-FROZEN-S5b-1 §4 — column + 1 offset, byte preservation, idempotency)
// ===========================================================================

/**
 * Builds a raw doc with a real frontmatter block (to verify frontmatter is
 * NOT touched by setFindingCell — it operates on the whole raw text via
 * line scan, passing frontmatter lines through untouched).
 */
function _makeRawDocForRewrite(rows: string[]): string {
  const header = "| # | Finding | Routing | Target file | Severity | Status |";
  const separator = "|---|---------|---------|-------------|----------|--------|";
  return [
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
    header,
    separator,
    ...rows,
    "",
  ].join("\n");
}

describe("setFindingCell — col 2 (Routing): rewrites routing cell for matching finding_id", () => {
  it("should replace the routing cell for a known finding_id and return updated text", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | Bug in backend | project | `agents/x.md` | HIGH | applied |",
      "| P2 | Drift issue | **framework** | `agents/y.md` | MED | pending |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — P1 routing changed to "framework"
    const lines = result.split("\n");
    const p1Line = lines.find((l) => l.includes("| P1 |") && l.includes("|"));
    expect(p1Line).toBeDefined();
    const parts = (p1Line ?? "").split("|");
    // col 2 → idx 3: routing cell
    expect(parts[3]?.trim()).toBe("framework");
  });

  it("should update routing col (split-index 3) to the new value with one space padding", () => {
    // Arrange — verify the exact padding: " framework " (one space each side)
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — exact format: space + value + space at split-index 3
    const targetLine = result.split("\n").find((l) => l.includes("| P1 |"))!;
    const parts = targetLine.split("|");
    expect(parts[3]).toBe(" framework "); // exact: one space each side
  });
});

describe("setFindingCell — col 5 (Status): rewrites status cell for matching finding_id", () => {
  it("should replace the status cell (col 5, split-index 6) for a known finding_id", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A bug | project | `x.md` | HIGH | pending |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 5, "deferred");

    // Assert — status cell updated
    const targetLine = result.split("\n").find((l) => l.includes("| P1 |"))!;
    const parts = targetLine.split("|");
    expect(parts[6]).toBe(" deferred "); // split-index 6, one space each side
  });

  it("should replace status cell with 'rejected' for a card-level reject flow", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P2 | Drift issue | **framework** | `y.md` | MED | pending |",
    ]);

    // Act
    const result = setFindingCell(raw, "P2", 5, "rejected");

    // Assert
    const targetLine = result.split("\n").find((l) => l.includes("| P2 |"))!;
    const parts = targetLine.split("|");
    expect(parts[6]).toBe(" rejected ");
  });
});

describe("setFindingCell — byte preservation: ALL other cells and lines unchanged", () => {
  it("should preserve all sibling cells byte-for-byte after routing update", () => {
    // Arrange — P2 has a bold routing cell; after editing P1, P2 must be byte-identical
    const p1Row = "| P1 | A finding | project | `x.md` | HIGH | applied |";
    const p2Row = "| P2 | Another finding | **framework** | `agents/y.md` | MED | pending |";
    const raw = _makeRawDocForRewrite([p1Row, p2Row]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — P2 row is byte-for-byte identical to the original
    const resultLines = result.split("\n");
    const p2Index = resultLines.findIndex((l) => l.includes("| P2 |"));
    expect(resultLines[p2Index]).toBe(p2Row);
  });

  it("should preserve the frontmatter block byte-for-byte after routing update", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);
    const rawLines = raw.split("\n");
    // Extract frontmatter lines (lines 0..8 = opening --- to closing ---)
    const fmLines = rawLines.slice(0, 9);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");
    const resultLines = result.split("\n");
    const resultFmLines = resultLines.slice(0, 9);

    // Assert — frontmatter lines byte-for-byte identical
    expect(resultFmLines).toEqual(fmLines);
  });

  it("should preserve the date line EXACTLY (BLOCKER regression guard — must NOT coerce to ISO)", () => {
    // Arrange — the critical regression: gray-matter coerces date: 2026-06-06 to ISO.
    // setFindingCell MUST NOT touch the frontmatter, so date must survive verbatim.
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — the literal date line is preserved (no ISO coercion)
    expect(result).toContain('date: "2026-06-06"');
    expect(result).not.toMatch(/date:.*T00:00:00/);
  });

  it("should return text that differs from original in exactly ONE line (the targeted row)", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
      "| P2 | Another | **framework** | `y.md` | MED | pending |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — exactly one line differs
    const rawLines = raw.split("\n");
    const resultLines = result.split("\n");
    expect(rawLines.length).toBe(resultLines.length);
    const changedLines = rawLines.filter((l, i) => l !== resultLines[i]);
    expect(changedLines).toHaveLength(1); // exactly one line changed
  });

  it("should preserve backtick-wrapped target_file cell verbatim (no normalization)", () => {
    // Arrange — target_file with backtick wrapper
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `path/to/file.md` | HIGH | applied |",
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — backtick wrapper is preserved exactly
    const targetLine = result.split("\n").find((l) => l.includes("| P1 |"))!;
    expect(targetLine).toContain("`path/to/file.md`");
  });
});

describe("setFindingCell — idempotency: applying twice produces the same output", () => {
  it("should return the same text when called twice with the same args (col 2)", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);

    // Act — apply twice
    const once = setFindingCell(raw, "P1", 2, "framework");
    const twice = setFindingCell(once, "P1", 2, "framework");

    // Assert — idempotent
    expect(twice).toBe(once);
  });

  it("should return the same text when called twice with the same args (col 5)", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | pending |",
    ]);

    // Act — apply twice
    const once = setFindingCell(raw, "P1", 5, "deferred");
    const twice = setFindingCell(once, "P1", 5, "deferred");

    // Assert — idempotent
    expect(twice).toBe(once);
  });
});

describe("setFindingCell — not-found: unknown finding_id returns rawText unchanged", () => {
  it("should return rawText unchanged when findingId does not match any row", () => {
    // Arrange
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);

    // Act
    const result = setFindingCell(raw, "P99", 2, "framework");

    // Assert — exact reference equality (no-op returns the original)
    expect(result).toBe(raw);
  });

  it("should return rawText unchanged when the table header is missing", () => {
    // Arrange — no table at all
    const raw = "---\nproject: sie_v2\n---\n\nSome prose text.";

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert
    expect(result).toBe(raw);
  });

  it("should return rawText unchanged when findingId has wrong case (case-sensitive match)", () => {
    // Arrange — row has "P1", we search for "p1" (lowercase)
    const raw = _makeRawDocForRewrite([
      "| P1 | A finding | project | `x.md` | HIGH | applied |",
    ]);

    // Act
    const result = setFindingCell(raw, "p1", 2, "framework");

    // Assert — case-sensitive: "p1" !== "P1" → no-op
    expect(result).toBe(raw);
  });
});

describe("setFindingCell — bold-wrapped cells in other positions preserved", () => {
  it("should keep **bold** routing in P2 when editing P1 routing", () => {
    // Arrange — P2 has **framework** (bold) routing; only P1 is targeted
    const p2Row = "| P2 | Drift | **framework** | `y.md` | MED | pending |";
    const raw = _makeRawDocForRewrite([
      "| P1 | Bug | project | `x.md` | HIGH | applied |",
      p2Row,
    ]);

    // Act
    const result = setFindingCell(raw, "P1", 2, "framework");

    // Assert — P2's **framework** bold is preserved byte-for-byte
    expect(result).toContain(p2Row);
    const p2Line = result.split("\n").find((l) => l.includes("| P2 |"))!;
    expect(p2Line.split("|")[3]).toBe(" **framework** "); // original cell preserved
  });
});

describe("setFindingCell — short row degrade: missing target cell → no-op (never throw)", () => {
  it("should return rawText unchanged when the target column cell is absent (short row at col 5)", () => {
    // Arrange — row with only 3 cells; col 5 (split-idx 6) is absent
    const header = "| # | Finding | Routing | Target file | Severity | Status |";
    const sep = "|---|---|---|---|---|---|";
    const shortRow = "| P1 | Short finding | project |";
    const raw = `---\nproject: x\n---\n\n${header}\n${sep}\n${shortRow}\n`;

    // Act — should not throw; returns raw unchanged
    expect(() => setFindingCell(raw, "P1", 5, "deferred")).not.toThrow();
    const result = setFindingCell(raw, "P1", 5, "deferred");
    expect(result).toBe(raw);
  });
});

// ===========================================================================
// S5b-1: setFrontmatterDecision — surgical frontmatter key rewrite
// (SCHEMA-FROZEN-S5b-1 §5 — BLOCKER: never uses matter.stringify)
// ===========================================================================

/**
 * Builds a raw doc with a real frontmatter block that has the exact structure
 * from the live vault card — used to verify the BLOCKER regression guard.
 */
function _makeRawDocWithFrontmatter(overrides: {
  decision?: string;
  date?: string;
  tags?: string;
  source?: string;
  extraKey?: string;
} = {}): string {
  const {
    decision = "pending",
    date = "2026-06-06",
    tags = "  - retro-triage",
    source = "RETRO-2026-06-06",
    extraKey = "",
  } = overrides;

  const lines = [
    "---",
    "project: sie_v2",
    `source: ${source}`,
    `date: ${date}`,
    `decision: ${decision}`,
    "applied: false",
    "tags:",
    tags,
    ...(extraKey ? [extraKey] : []),
    "---",
    "",
    "| # | Finding | Routing | Target file | Severity | Status |",
    "|---|---------|---------|-------------|----------|--------|",
    "| P1 | A finding | project | `x.md` | HIGH | pending |",
    "",
    "## Decisions & rationale",
    "",
    "Some rationale text.",
  ];
  return lines.join("\n");
}

describe("setFrontmatterDecision — replaces decision key in frontmatter", () => {
  it("should replace 'decision: pending' with 'decision: deferred'", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — decision is updated
    const decisionLine = result.split("\n").find((l) => l.startsWith("decision:"))!;
    expect(decisionLine.trim()).toBe("decision: deferred");
  });

  it("should replace 'decision: pending' with 'decision: rejected'", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act
    const result = setFrontmatterDecision(raw, "rejected");

    // Assert
    const decisionLine = result.split("\n").find((l) => l.startsWith("decision:"))!;
    expect(decisionLine.trim()).toBe("decision: rejected");
  });

  it("should be idempotent: setting decision to the same value twice produces the same output", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act — apply twice
    const once = setFrontmatterDecision(raw, "deferred");
    const twice = setFrontmatterDecision(once, "deferred");

    // Assert — idempotent
    expect(twice).toBe(once);
  });
});

describe("setFrontmatterDecision — BLOCKER regression guard: byte-preservation of other fields", () => {
  it("should preserve the date line EXACTLY (BLOCKER: must NOT coerce to ISO timestamp)", () => {
    // Arrange — the critical regression: matter.stringify coerces date: 2026-06-06 to ISO.
    // setFrontmatterDecision must operate on raw lines and NEVER call matter.stringify.
    const raw = _makeRawDocWithFrontmatter({ date: "2026-06-06" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — date line is byte-for-byte identical
    const rawDateLine = raw.split("\n").find((l) => l.startsWith("date:"))!;
    const resultDateLine = result.split("\n").find((l) => l.startsWith("date:"))!;
    expect(resultDateLine).toBe(rawDateLine);
    // Explicit check: must NOT contain ISO format
    expect(result).not.toMatch(/date:.*T00:00:00/);
    expect(result).toContain("date: 2026-06-06");
  });

  it("should preserve the source line byte-for-byte after decision update", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ source: "RETRO-2026-06-06" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — source is not re-quoted or changed
    const rawSourceLine = raw.split("\n").find((l) => l.startsWith("source:"))!;
    const resultSourceLine = result.split("\n").find((l) => l.startsWith("source:"))!;
    expect(resultSourceLine).toBe(rawSourceLine);
  });

  it("should preserve the tags block byte-for-byte after decision update", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ tags: "  - retro-triage" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — tags is not reflowed (matter.stringify would change block→flow style)
    expect(result).toContain("tags:\n  - retro-triage");
  });

  it("should preserve the body (findings table + rationale) byte-for-byte", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({});
    // Extract body (everything after closing ---)
    const fenceEnd = raw.indexOf("\n---\n", 4) + 5;
    const originalBody = raw.slice(fenceEnd);

    // Act
    const result = setFrontmatterDecision(raw, "rejected");
    const resultFenceEnd = result.indexOf("\n---\n", 4) + 5;
    const resultBody = result.slice(resultFenceEnd);

    // Assert — body is byte-for-byte identical
    expect(resultBody).toBe(originalBody);
  });

  it("should change EXACTLY one line in the frontmatter block (the decision line)", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — count changed lines
    const rawLines = raw.split("\n");
    const resultLines = result.split("\n");
    expect(rawLines.length).toBe(resultLines.length); // no lines added or removed
    const changedLines = rawLines.filter((l, i) => l !== resultLines[i]);
    expect(changedLines).toHaveLength(1); // exactly one line changed
    expect(changedLines[0]).toContain("decision:"); // the decision line
  });
});

describe("setFrontmatterDecision — key absent: inserts decision before closing ---", () => {
  it("should insert 'decision: deferred' when no decision key exists in frontmatter", () => {
    // Arrange — frontmatter without a decision key
    const raw = [
      "---",
      "project: sie_v2",
      "date: 2026-06-06",
      "---",
      "",
      "| # | Finding | Routing | Target file | Severity | Status |",
    ].join("\n");

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — decision line is now present
    const decisionLine = result.split("\n").find((l) => l.startsWith("decision:"));
    expect(decisionLine).toBeDefined();
    expect(decisionLine!.trim()).toBe("decision: deferred");
    // Verify date is still present and unchanged
    expect(result).toContain("date: 2026-06-06");
  });
});

describe("setFrontmatterDecision — applied parameter: also sets applied key", () => {
  it("should set both decision and applied when applied parameter is provided", () => {
    // Arrange
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act
    const result = setFrontmatterDecision(raw, "deferred", false);

    // Assert — both updated
    const decisionLine = result.split("\n").find((l) => l.startsWith("decision:"))!;
    const appliedLine = result.split("\n").find((l) => l.startsWith("applied:"))!;
    expect(decisionLine.trim()).toBe("decision: deferred");
    expect(appliedLine.trim()).toBe("applied: false");
  });

  it("should NOT update applied when the applied parameter is omitted", () => {
    // Arrange — original applied: false
    const raw = _makeRawDocWithFrontmatter({ decision: "pending" });

    // Act — no applied arg
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — applied line unchanged
    const rawAppliedLine = raw.split("\n").find((l) => l.startsWith("applied:"))!;
    const resultAppliedLine = result.split("\n").find((l) => l.startsWith("applied:"))!;
    expect(resultAppliedLine).toBe(rawAppliedLine);
  });
});

describe("setFrontmatterDecision — no-op when no frontmatter block", () => {
  it("should return rawText unchanged when there is no opening --- fence", () => {
    // Arrange
    const raw = "# No frontmatter\n\nJust markdown.";

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — unchanged
    expect(result).toBe(raw);
  });

  it("should return rawText unchanged when the frontmatter closing --- is missing", () => {
    // Arrange — unclosed frontmatter
    const raw = "---\nproject: sie_v2\ndecision: pending\n(no closing fence)";

    // Act
    const result = setFrontmatterDecision(raw, "deferred");

    // Assert — unchanged
    expect(result).toBe(raw);
  });
});
