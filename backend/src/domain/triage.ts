/**
 * Domain layer — pure RETRO triage parser + surgical rewriters (S5a + S5b-1).
 *
 * No fs, no process.env, no external I/O. Unit-testable without mocks.
 *
 * Exports (S5a):
 *   parseTriageDoc(rawText)  — full doc parse (frontmatter + table + rationale).
 *                              Returns a TriageDoc WITHOUT the `id` field.
 *                              Reader sets `id` from filename. Never throws.
 *   parseTriageFindings(markdownBody) — isolated table parser (testable unit).
 *
 * Exports (S5b-1):
 *   setFindingCell(rawText, findingId, column, value) — surgical single-cell
 *     rewrite of the findings table. Never throws. Pure, idempotent.
 *   setFrontmatterDecision(rawText, decision, applied?) — surgical frontmatter
 *     key-replace. NEVER uses matter.stringify (BLOCKER: coerces date).
 *
 * Algorithm implementation: SCHEMA-FROZEN-S5a §3 + SCHEMA-FROZEN-S5b-1 §4/§5 (LL-011).
 */
import matter from "gray-matter";
import type { TriageFinding } from "@kuraka-control/contracts";

// ── helpers ────────────────────────────────────────────────────────────────────

/** Convert unknown to trimmed string; return "" when absent/null/undefined. */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** "" → null; non-empty string → string (after trim). */
function emptyToNull(value: unknown): string | null {
  const s = toStr(value);
  return s === "" ? null : s;
}

/** Strip surrounding **…** bold wrapper if the cell starts AND ends with "**". */
function stripBold(cell: string): string {
  if (cell.startsWith("**") && cell.endsWith("**") && cell.length > 4) {
    return cell.slice(2, -2).trim();
  }
  return cell;
}

/** Strip surrounding backticks (single) if the cell starts AND ends with "`". */
function stripBackticks(cell: string): string {
  if (cell.startsWith("`") && cell.endsWith("`") && cell.length > 2) {
    return cell.slice(1, -1).trim();
  }
  return cell;
}

/**
 * Returns true when every non-empty cell in the split row consists only of
 * the chars  `-`, `:`, and ` ` (space) — i.e. it is a markdown separator row.
 */
function isSeparatorRow(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => c !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((c) => /^[-:\s]+$/.test(c));
}

/**
 * Split a raw pipe-delimited line into trimmed cells, dropping the outer
 * empty artifacts produced by leading/trailing `|`.
 *
 * Per §3 §4: split on "|", drop first/last element ONLY IF empty after trim.
 */
function splitPipeLine(raw: string): string[] {
  const parts = raw.split("|");
  const first = parts[0]?.trim();
  const last = parts[parts.length - 1]?.trim();

  const inner = parts.slice(
    first === "" ? 1 : 0,
    last === "" ? parts.length - 1 : parts.length,
  );

  return inner.map((c) => c.trim());
}

// ── table parser ───────────────────────────────────────────────────────────────

/**
 * Parse the markdown findings table from a body string.
 *
 * Algorithm: SCHEMA-FROZEN-S5a §3.B (LL-011).
 * Column order (positional, fixed): [0]=id [1]=finding [2]=routing
 *                                   [3]=target_file [4]=severity [5]=status
 * Never throws. Returns [] when no header is found or all rows are blank.
 */
export function parseTriageFindings(markdownBody: string): TriageFinding[] {
  const lines = markdownBody.split("\n");
  const findings: TriageFinding[] = [];

  // B.1 — FIND HEADER: first line that starts with "|" and contains both
  //        "finding" and "routing" as cell values (lower-cased, trimmed).
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!trimmed.startsWith("|")) continue;
    const cells = splitPipeLine(trimmed).map((c) => c.toLowerCase());
    if (cells.includes("finding") && cells.includes("routing")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return [];
  }

  // B.2 — SKIP SEPARATOR: the line immediately after the header.
  //        Skip it ONLY if it IS a separator row (defensive: if not, treat as body row).
  let bodyStart = headerIndex + 1;
  if (bodyStart < lines.length) {
    const candidateSep = lines[bodyStart]?.trim() ?? "";
    if (candidateSep.startsWith("|")) {
      const sepCells = splitPipeLine(candidateSep);
      if (isSeparatorRow(sepCells)) {
        bodyStart += 1;
      }
      // If NOT a separator, do not consume — bodyStart stays at headerIndex + 1.
    }
  }

  // B.3 — ITERATE BODY
  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    // Stop conditions: blank line, line starting with "##", or not a pipe line.
    if (trimmed === "") break;
    if (trimmed.startsWith("##")) break;
    if (!trimmed.startsWith("|")) break;

    // B.4 — CELL EXTRACTION
    const cells = splitPipeLine(trimmed);

    // Skip rows where every cell is empty (template blank rows like "| 2 | | | | | |").
    if (cells.every((c) => c === "")) continue;

    // B.5 — NORMALIZE DECORATIONS
    const rawId = cells[0] ?? "";
    const rawFinding = cells[1] ?? "";
    const rawRouting = cells[2] ?? "";
    const rawTargetFile = cells[3] ?? "";
    const rawSeverity = cells[4] ?? "";
    const rawStatus = cells[5] ?? "";

    // routing, severity, status: strip surrounding **bold**
    const normalizedRouting = emptyToNull(stripBold(rawRouting));
    const normalizedSeverity = emptyToNull(stripBold(rawSeverity));
    const normalizedStatus = emptyToNull(stripBold(rawStatus));

    // target_file: strip surrounding backticks
    const normalizedTargetFile = emptyToNull(stripBackticks(rawTargetFile));

    // id, finding: no decoration stripping; "" → null
    const normalizedId = emptyToNull(rawId);
    const normalizedFinding = emptyToNull(rawFinding);

    // B.6 — MAP BY COLUMN ORDER (short row → null for missing; long row → extras ignored)
    findings.push({
      id: normalizedId,
      finding: normalizedFinding,
      routing: normalizedRouting,
      target_file: normalizedTargetFile,
      severity: normalizedSeverity,
      status: normalizedStatus,
    });
  }

  return findings;
}

// ── rationale extractor ────────────────────────────────────────────────────────

/**
 * Capture text under "## Decisions & rationale" until next "##" heading or EOF.
 * Case-insensitive heading match on the full trimmed line.
 * Returns null when the section is absent or empty.
 */
function extractRationale(markdownBody: string): string | null {
  const lines = markdownBody.split("\n");

  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!capturing) {
      if (trimmed.toLowerCase() === "## decisions & rationale") {
        capturing = true;
      }
      continue;
    }

    // Stop at any subsequent "##" heading
    if (trimmed.startsWith("##")) {
      break;
    }

    captured.push(line);
  }

  if (!capturing) return null;

  const joined = captured.join("\n").trim();
  return joined === "" ? null : joined;
}

// ── full doc parser ────────────────────────────────────────────────────────────

/** Intermediate type: TriageDoc without `id` (reader sets it from filename). */
export type TriageDocWithoutId = {
  project: string | null;
  source: string | null;
  date: string | null;
  decision: string | null;
  applied: boolean | null;
  tags: string[];
  findings: TriageFinding[];
  rationale: string | null;
};

/**
 * Parse a raw triage markdown file (text string) into a TriageDocWithoutId.
 *
 * Algorithm: SCHEMA-FROZEN-S5a §3.A + §3.B + §3.C (LL-011).
 * Never throws — any parse failure returns a zero-value doc.
 */
export function parseTriageDoc(rawText: string): TriageDocWithoutId {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(rawText);
  } catch {
    return {
      project: null,
      source: null,
      date: null,
      decision: null,
      applied: null,
      tags: [],
      findings: [],
      rationale: null,
    };
  }

  const data = parsed.data as Record<string, unknown>;

  // A.2 — FRONTMATTER FIELDS (snake_case 1:1)
  const project = emptyToNull(data["project"]);
  const source = emptyToNull(data["source"]);
  const date = emptyToNull(data["date"]);         // verbatim, NOT coerced to Date
  const decision = emptyToNull(data["decision"]);

  // applied: boolean | null — only boolean is accepted; anything else → null
  const applied =
    typeof data["applied"] === "boolean" ? data["applied"] : null;

  // tags: [] when missing or not array
  const tags = Array.isArray(data["tags"])
    ? (data["tags"] as unknown[]).map((t) => String(t))
    : [];

  // B — FINDINGS TABLE (parsed from body)
  const findings = parseTriageFindings(parsed.content);

  // C — RATIONALE
  const rationale = extractRationale(parsed.content);

  return { project, source, date, decision, applied, tags, findings, rationale };
}

// ── S5b-1: Surgical write helpers ─────────────────────────────────────────────

/**
 * Pure helper: scan body rows of the findings table for `findingId` and replace
 * the cell at `column` with `value`.
 *
 * @param lines      full document split on "\n" (mutated copy, never the original).
 * @param bodyStart  index of the first body row (after header + separator).
 * @param findingId  exact id string to match (no case fold).
 * @param column     2 (Routing) or 5 (Status) — 0-based column index.
 * @param value      new plain text value; written with one space pad each side.
 * @returns          updated lines array, or null when findingId is not found.
 */
function findAndReplaceRow(
  lines: string[],
  bodyStart: number,
  findingId: string,
  column: number,
  value: string,
): string[] | null {
  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    // Stop conditions (mirror parseTriageFindings).
    if (trimmed === "") break;
    if (trimmed.startsWith("##")) break;
    if (!trimmed.startsWith("|")) break;

    const rowCells = splitPipeLine(trimmed);
    const rowId = emptyToNull(stripBold(rowCells[0] ?? ""));

    if (rowId !== findingId) continue;

    // Surgical replace on the ORIGINAL raw line (not the trimmed/normalized cells).
    const parts = raw.split("|");
    const idx = column + 1;  // col 2 (Routing) → idx 3; col 5 (Status) → idx 6

    // Short row: target cell absent → degrade, return null (not-found).
    if (idx >= parts.length) return null;

    parts[idx] = ` ${value} `;      // plain value, ONE space pad each side, NO **bold**
    lines[i] = parts.join("|");     // replace ONLY this line
    return lines;
  }

  // No row matched.
  return null;
}

/**
 * Surgical single-cell table rewrite (SCHEMA-FROZEN-S5b-1 §4).
 *
 * Replaces ONE cell in the findings table identified by `findingId` at
 * `column` (2 = Routing, 5 = Status). All other cells and all other lines
 * are byte-for-byte preserved.
 *
 * NOTE: uses raw-line scan on the whole rawText — does NOT use matter.stringify
 * (which corrupts `date` by coercing to ISO timestamp). The leading `---` block
 * lines are passed through untouched as part of the full split.
 *
 * @param rawText    full raw file content.
 * @param findingId  exact id string to match (no case fold).
 * @param column     2 (Routing) or 5 (Status) — 0-based column index in the S5a positional map.
 * @param value      new plain text value; written with one space pad each side.
 * @returns          updated raw text; if findingId is not found, returns rawText unchanged.
 */
export function setFindingCell(
  rawText: string,
  findingId: string,
  column: 2 | 5,
  value: string,
): string {
  // A — split WHOLE raw document (frontmatter lines pass through untouched).
  const lines = rawText.split("\n");

  // B — locate header line using the SAME anchor as parseTriageFindings:
  //     first "|"-starting line whose splitPipeLine cells include both "finding" and "routing".
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!trimmed.startsWith("|")) continue;
    const cells = splitPipeLine(trimmed).map((c) => c.toLowerCase());
    if (cells.includes("finding") && cells.includes("routing")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return rawText;  // no table found — no-op
  }

  // C — skip separator row immediately after header (defensive: if not separator, do not skip).
  let bodyStart = headerIndex + 1;
  if (bodyStart < lines.length) {
    const candidateSep = lines[bodyStart]?.trim() ?? "";
    if (candidateSep.startsWith("|")) {
      const sepCells = splitPipeLine(candidateSep);
      if (isSeparatorRow(sepCells)) {
        bodyStart += 1;
      }
    }
  }

  // D — scan body rows and replace; null return means no matching row.
  const updated = findAndReplaceRow([...lines], bodyStart, findingId, column, value);
  if (updated === null) return rawText;

  // E — return updated text; all other lines byte-for-byte preserved.
  return updated.join("\n");
}

// Re-export frontmatter rewriters — extracted to triageFrontmatter.ts for LOC limits.
export { setFrontmatterDecision } from "./triageFrontmatter.js";
