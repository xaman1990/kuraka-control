import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TriageFinding } from "@kuraka-control/contracts";
import { TRIAGE_ERROR_PATH_FORBIDDEN, TRIAGE_ERROR_WRITE_FAILED, TRIAGE_ERROR_NOT_FOUND, TRIAGE_ERROR_BAD_REQUEST, TRIAGE_ERROR_CONFLICT } from "@kuraka-control/contracts";
import {
  applyFinding,
  isConfirmRequiredError,
  isConflictError,
} from "../api/triage.js";
import type { TriageActionError, ConfirmRequiredDetail } from "../api/triage.js";
import { ConfirmApplyModal } from "./ConfirmApplyModal.js";

// ── Inline error display (local copy for apply-specific codes) ─────────────────

interface ApplyErrorProps {
  error: unknown;
}

function ApplyError({ error }: ApplyErrorProps) {
  if (error === null || error === undefined) return null;

  const e = error as TriageActionError;
  let message = "Apply failed.";

  if (e?.code === TRIAGE_ERROR_PATH_FORBIDDEN) {
    message = "Write not permitted (path forbidden).";
  } else if (e?.code === TRIAGE_ERROR_WRITE_FAILED) {
    message = "Write failed — check vault permissions.";
  } else if (e?.code === TRIAGE_ERROR_NOT_FOUND) {
    message = "Finding not found.";
  } else if (e?.code === TRIAGE_ERROR_BAD_REQUEST) {
    message = "Invalid request (route finding before applying).";
  } else if (e?.code === TRIAGE_ERROR_CONFLICT) {
    const d = e?.detail as { conflicting_card?: { id?: string } } | null;
    const cid = d?.conflicting_card?.id;
    message = cid
      ? `Conflict: already applied in card "${cid}".`
      : "Conflict: target already applied by a sibling.";
  } else if (e?.message) {
    message = e.message;
  }

  return (
    <span
      role="alert"
      style={{
        fontSize: "11px",
        color: "var(--accent)",
        marginLeft: "4px",
        display: "inline-block",
      }}
    >
      {message}
    </span>
  );
}

// ── FindingApplyControl ────────────────────────────────────────────────────────

export interface FindingApplyControlProps {
  docId: string;
  finding: TriageFinding;
}

/**
 * FindingApplyControl — per-row Apply button in the findings table.
 *
 * Project-routed: one-click apply (no token). Invalidates ["triage"] on success.
 * Framework-routed: first POST returns 403 CONFIRM_REQUIRED → opens ConfirmApplyModal
 *   which re-POSTs with the confirm_token. On 409 CONFLICT: inline conflict error.
 * Disables while pending. Named type imports only (review-check §8).
 */
export function FindingApplyControl({ docId, finding }: FindingApplyControlProps) {
  const queryClient = useQueryClient();
  const [confirmDetail, setConfirmDetail] = useState<ConfirmRequiredDetail | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => applyFinding(docId, { finding_id: finding.id ?? "" }),
    onSuccess: () => {
      setConflictError(null);
      void queryClient.invalidateQueries({ queryKey: ["triage"] });
    },
    onError: (err: unknown) => {
      setConflictError(null);
      if (isConfirmRequiredError(err)) {
        setConfirmDetail(err.detail);
        return;
      }
      if (isConflictError(err)) {
        const cid = err.detail?.conflicting_card?.id;
        setConflictError(
          cid
            ? `Conflict: already applied in card "${cid}".`
            : "Conflict: target already applied by a sibling.",
        );
      }
    },
  });

  const isDisabled = mutation.isPending || !finding.id;
  const routing = finding.routing?.toLowerCase();

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <button
        type="button"
        onClick={() => {
          setConflictError(null);
          mutation.mutate();
        }}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        style={{
          fontSize: "11px",
          padding: "2px 8px",
          borderRadius: "4px",
          border: `1px solid ${routing === "framework" ? "var(--gov-framework)" : "var(--jade)"}`,
          background: "var(--surface-2)",
          color: routing === "framework" ? "var(--gov-framework)" : "var(--jade)",
          cursor: isDisabled ? "wait" : "pointer",
          opacity: isDisabled ? 0.6 : 1,
        }}
      >
        {mutation.isPending ? "…" : "Apply"}
      </button>

      {conflictError !== null && (
        <span
          role="alert"
          style={{
            fontSize: "11px",
            color: "var(--accent)",
            marginLeft: "4px",
            display: "inline-block",
          }}
        >
          {conflictError}
        </span>
      )}

      {mutation.isError &&
        !isConfirmRequiredError(mutation.error) &&
        !isConflictError(mutation.error) && <ApplyError error={mutation.error} />}

      {confirmDetail !== null && (
        <ConfirmApplyModal
          docId={docId}
          findingId={finding.id ?? ""}
          confirmDetail={confirmDetail}
          onClose={() => setConfirmDetail(null)}
          onSuccess={() => {
            setConfirmDetail(null);
            void queryClient.invalidateQueries({ queryKey: ["triage"] });
          }}
        />
      )}
    </span>
  );
}
