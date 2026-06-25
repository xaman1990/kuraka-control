/**
 * Service — triage write actions (S5b-1 + S5b-2).
 *
 * Functions: routeFinding, deferTriage, rejectTriage (S5b-1); applyTriage (S5b-2).
 * Each reads the target card, applies a pure domain transformation, writes
 * atomically through the WriteFirewall, then re-reads from disk to return
 * the fresh TriageDoc (disk truth — SCHEMA-FROZEN-S5b-1 §6/§7).
 *
 * String sentinels mirror projectLayer.ts: "NOT_FOUND" | "BAD_REQUEST".
 * S5b-2 extends with discriminated-object sentinels: ConfirmRequired | ConflictResult.
 * WriteFirewallError propagates to the route layer uncaught.
 * VaultUnreadableError propagates to the route layer uncaught.
 *
 * RL-6: applyTriage contains NO spawn/exec/execFile/mount calls.
 * No gold content write: applyTriage NEVER writes to agents/ or calls writeFrameworkPatch.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { TriageDoc, TriageRouting } from "@kuraka-control/contracts";
import { parseTriageDoc, setFindingCell, setFrontmatterDecision } from "../domain/triage.js";
import {
  writeTriageRecord,
  TRIAGE_RECORD_DIR,
} from "../repositories/writeFirewall.js";
import { listTriageDocs } from "../repositories/triageReader.js";
import {
  verifyConfirmToken,
  markTokenUsed,
  tokenReplayKey,
} from "./confirmToken.js";
import { env } from "../config/env.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Returned by the framework branch when no valid confirm token is present.
 * Carries the exact re-read scope so the route can mint without a second disk read.
 */
export interface ConfirmRequired {
  kind: "CONFIRM_REQUIRED";
  scope: { id: string; finding_id: string; target_file: string };
}

/**
 * Returned by RL-5 conflict scan when a sibling has already applied the same target_file.
 * first-match only; finding_id MAY be null (display metadata, not a path).
 */
export interface ConflictResult {
  kind: "CONFLICT";
  detail: {
    target_file: string;
    conflicting_card: { id: string; finding_id: string | null };
  };
}

export type ActionResult =
  | TriageDoc
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | ConfirmRequired
  | ConflictResult;

export interface RouteInput {
  id: string;
  finding_id?: string;
  routing: TriageRouting;
  vaultRoot?: string;
}

export interface DeferInput {
  id: string;
  finding_id?: string;
  vaultRoot?: string;
}

export interface RejectInput {
  id: string;
  finding_id?: string;
  vaultRoot?: string;
}

export interface ApplyInput {
  id: string;
  finding_id?: string | null;
  confirm_token?: string | null;
  vaultRoot?: string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Read the raw card text; return null on ENOENT, rethrow anything else. */
async function readCard(cardPath: string): Promise<string | null> {
  try {
    return await fs.readFile(cardPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Re-read the written card from disk and return a fresh TriageDoc.
 * This is the "disk truth" re-read mandated by SCHEMA-FROZEN-S5b-1 §6.
 */
async function reReadCard(vaultRoot: string, id: string): Promise<TriageDoc> {
  const cardPath = path.join(vaultRoot, TRIAGE_RECORD_DIR, `${id}.md`);
  const written = await fs.readFile(cardPath, "utf-8");
  return { id, ...parseTriageDoc(written) };
}

// ── Public action functions ───────────────────────────────────────────────────

/**
 * Route a finding to "framework" or "project".
 *
 * finding_id is REQUIRED for route (a card has no single routing).
 * Absent finding_id → "BAD_REQUEST".
 * Unknown finding_id (setFindingCell no-op) → "NOT_FOUND".
 */
export async function routeFinding(input: RouteInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  // finding_id is required for route action.
  if (!input.finding_id) {
    return "BAD_REQUEST";
  }

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  const newText = setFindingCell(raw, input.finding_id, 2, input.routing);

  // No-op detection: setFindingCell returned unchanged text → unknown finding_id.
  if (newText === raw) return "NOT_FOUND";

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}

/**
 * Defer a finding (col 5 → "deferred") or a whole card (frontmatter decision → "deferred").
 *
 * finding_id present → sets status cell for that row.
 * finding_id absent  → sets frontmatter `decision: deferred`.
 * Unknown finding_id → "NOT_FOUND".
 */
export async function deferTriage(input: DeferInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  let newText: string;

  if (input.finding_id) {
    newText = setFindingCell(raw, input.finding_id, 5, "deferred");
    if (newText === raw) return "NOT_FOUND";
  } else {
    // Card-level defer: setFrontmatterDecision idempotent no-op is a valid success.
    newText = setFrontmatterDecision(raw, "deferred");
  }

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}

/**
 * Reject a finding (col 5 → "rejected") or a whole card (frontmatter decision → "rejected").
 *
 * finding_id present → sets status cell for that row.
 * finding_id absent  → sets frontmatter `decision: rejected`.
 * Unknown finding_id → "NOT_FOUND".
 */
export async function rejectTriage(input: RejectInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  let newText: string;

  if (input.finding_id) {
    newText = setFindingCell(raw, input.finding_id, 5, "rejected");
    if (newText === raw) return "NOT_FOUND";
  } else {
    // Card-level reject: setFrontmatterDecision idempotent no-op is a valid success.
    newText = setFrontmatterDecision(raw, "rejected");
  }

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}

/**
 * Apply a finding (col 5 → "applied") — finding-scoped ONLY; card-level apply → BAD_REQUEST.
 *
 * Step order (SCHEMA-FROZEN-S5b-2 §3):
 *   1. finding_id guard — BAD_REQUEST if absent/blank.
 *   2. Read card — NOT_FOUND on ENOENT.
 *   3. Parse + find the finding — NOT_FOUND if not found.
 *   4. routing guard — BAD_REQUEST if null/blank or not "framework"|"project".
 *   5. target_file guard (§1.5) — BAD_REQUEST if null/blank.
 *   6. RL-5 conflict scan — re-reads ALL docs; CONFLICT if sibling already applied same target.
 *   7. Routing branch:
 *        project   → proceed to write (no token required).
 *        framework → verify confirm_token; if absent or not OK → return ConfirmRequired sentinel.
 *   8. WRITE via setFindingCell + writeTriageRecord (both branches after all gates).
 *   9. POST-WRITE (framework only): markTokenUsed AFTER successful write.
 *  10. Re-read card from disk → return fresh TriageDoc (disk truth).
 *
 * RL-6: NO spawn/exec/execFile/mount calls.
 * No gold content write: NEVER writes to agents/ or calls writeFrameworkPatch.
 */
export async function applyTriage(input: ApplyInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  // ── Step 1: finding_id guard ──────────────────────────────────────────────────
  if (!input.finding_id || input.finding_id.trim() === "") {
    return "BAD_REQUEST";
  }
  const findingId = input.finding_id;

  // ── Step 2: read card ────────────────────────────────────────────────────────
  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  // ── Step 3: parse + locate the finding ──────────────────────────────────────
  const doc = { id: input.id, ...parseTriageDoc(raw) };
  const finding = doc.findings.find((f) => f.id === findingId);
  if (!finding) return "NOT_FOUND";

  // ── Step 4: routing guard ────────────────────────────────────────────────────
  const routing = finding.routing;
  if (routing === null || routing.trim() === "") return "BAD_REQUEST";
  if (routing !== "framework" && routing !== "project") return "BAD_REQUEST";

  // ── Step 5: target_file guard (§1.5 null-target guard) ──────────────────────
  const targetFile = finding.target_file;
  if (targetFile === null || targetFile.trim() === "") return "BAD_REQUEST";

  // ── Step 6: RL-5 conflict scan (AFTER routing, BEFORE token/write) ───────────
  // Re-reads ALL triage docs from disk right now. Tolerates per-card parse failures.
  const allDocs = await listTriageDocs({ vaultRoot });
  for (const sibDoc of allDocs) {
    for (const F of sibDoc.findings) {
      // (a) SAME TARGET — null target never conflicts.
      if (F.target_file === null) continue;
      if (F.target_file !== targetFile) continue;

      // (b) NOT SELF — exclude the exact finding being applied.
      // GUARD the nullable F.id: a null-id sibling can never be "self" because
      // findingId is a non-empty string (step 1 guard). Self requires BOTH equal.
      const isSelf = sibDoc.id === input.id && F.id !== null && F.id === findingId;
      if (isSelf) continue;

      // (c) CONFLICTING STATE — sibling already applied the same target.
      const siblingApplied = F.status === "applied" || sibDoc.decision === "applied";
      if (siblingApplied) {
        const conflict: ConflictResult = {
          kind: "CONFLICT",
          detail: {
            target_file: targetFile,
            conflicting_card: { id: sibDoc.id, finding_id: F.id },
          },
        };
        return conflict;
      }
    }
  }

  // ── Step 7: routing branch ───────────────────────────────────────────────────
  let isFramework = false;
  if (routing === "framework") {
    isFramework = true;
    const scope = { id: input.id, finding_id: findingId, target_file: targetFile };
    const vr = input.confirm_token
      ? verifyConfirmToken(input.confirm_token, scope, Date.now())
      : "INVALID";
    if (vr !== "OK") {
      const confirmRequired: ConfirmRequired = { kind: "CONFIRM_REQUIRED", scope };
      return confirmRequired;
    }
  }

  // ── Step 8: WRITE (both branches, after all gates pass) ──────────────────────
  // NEVER calls matter.stringify (LL-013). Surgical raw-line edit only.
  // NOTE: step 3 already confirmed the finding exists, so a no-op here means the
  // cell is ALREADY set to "applied" (idempotent apply). Skip the redundant write
  // and proceed to re-read rather than returning NOT_FOUND (which would be wrong:
  // the finding is known to exist; this is a valid idempotent apply).
  const newText = setFindingCell(raw, findingId, 5, "applied");
  if (newText !== raw) {
    await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  }

  // ── Step 9: POST-WRITE (framework branch only) ────────────────────────────────
  // markTokenUsed ONLY after successful write — a transient write failure allows retry.
  // For idempotent applies (newText === raw) we still mark the token used: the gate
  // was fully exercised (RL-5 scan passed, token verified) and the on-disk state
  // reflects the expected outcome. Not marking would allow unlimited idempotent
  // framework re-applies with the same token, undermining the single-use property.
  if (isFramework && input.confirm_token) {
    const { hmacHex, issued_at } = tokenReplayKey(input.confirm_token);
    markTokenUsed(hmacHex, issued_at);
  }

  // ── Step 10: re-read + return fresh TriageDoc (disk truth) ───────────────────
  return reReadCard(vaultRoot, input.id);
}
