/**
 * Domain sub-module — surgical frontmatter rewriters (S5b-1 §5).
 *
 * Extracted from triage.ts to keep that file under max_file_loc.
 * No fs, no process.env, no external I/O. Pure, unit-testable.
 *
 * Exports:
 *   setFrontmatterDecision(rawText, decision, applied?) — surgical key-replace.
 *     NEVER uses matter.stringify (BLOCKER: coerces date:YYYY-MM-DD to ISO).
 */

/**
 * Internal helper: replace or insert a `key: value` line inside the frontmatter fence.
 * Scans lines[openIdx+1 .. closeIdx-1]; on first match, replaces. If no match, inserts
 * just before the closing fence line.
 *
 * Returns a NEW lines array (never mutates in place).
 */
function setFrontmatterKey(
  lines: string[],
  openIdx: number,
  closeIdx: number,
  key: string,
  value: string,
): string[] {
  const keyRegex = new RegExp(`^(\\s*${key}\\s*:)\\s*.*$`);
  const result = [...lines];

  for (let i = openIdx + 1; i < closeIdx; i++) {
    const line = result[i] ?? "";
    if (keyRegex.test(line)) {
      result[i] = line.replace(keyRegex, `$1 ${value}`);
      return result;
    }
  }

  // Key not found — insert just before the closing fence.
  result.splice(closeIdx, 0, `${key}: ${value}`);
  return result;
}

/**
 * Surgical frontmatter key rewrite (SCHEMA-FROZEN-S5b-1 §5).
 *
 * Replaces the `decision` line (and optionally `applied`) inside the
 * `---` frontmatter fence without touching any other line — including
 * `date`, `source`, `tags`.
 *
 * NOTE: NEVER uses matter.stringify (BLOCKER: coerces date:YYYY-MM-DD to
 * an ISO timestamp on round-trip). Operates on raw lines directly.
 *
 * @param rawText  full raw file content.
 * @param decision new value for the `decision:` key.
 * @param applied  optional boolean — when provided, also sets `applied:` key.
 * @returns        updated raw text. Returns rawText unchanged if no frontmatter block.
 */
export function setFrontmatterDecision(
  rawText: string,
  decision: string,
  applied?: boolean,
): string {
  // A — split into lines.
  let lines = rawText.split("\n");

  // B — check opening fence.
  if ((lines[0]?.trim() ?? "") !== "---") {
    return rawText;  // no frontmatter — no-op
  }

  // C — find closing fence (first line >= index 1 that is "---").
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i]?.trim() ?? "") === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return rawText;  // unclosed frontmatter — no-op
  }

  // D — set `decision` key.
  lines = setFrontmatterKey(lines, 0, closeIdx, "decision", decision);

  // E — optionally set `applied` key.
  // Re-find closeIdx in case an insert in step D shifted it by 1.
  if (applied !== undefined) {
    let newCloseIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if ((lines[i]?.trim() ?? "") === "---") {
        newCloseIdx = i;
        break;
      }
    }
    if (newCloseIdx !== -1) {
      lines = setFrontmatterKey(lines, 0, newCloseIdx, "applied", String(applied));
    }
  }

  // F — return updated text.
  return lines.join("\n");
}
