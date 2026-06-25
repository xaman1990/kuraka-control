import type { KeyboardEvent, MouseEvent } from "react";
import { useRef, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { applyFinding, isConfirmRequiredError, isConflictError } from "../api/triage.js";
import type { ConfirmRequiredDetail } from "../api/triage.js";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ConfirmApplyModalProps {
  docId: string;
  findingId: string;
  confirmDetail: ConfirmRequiredDetail;
  onClose: () => void;
  onSuccess: () => void;
}

// ── ConfirmApplyModal ─────────────────────────────────────────────────────────

/**
 * ConfirmApplyModal — two-step human-in-the-loop gate for framework-routed findings.
 *
 * Shows the gold `target_file`, a blast-radius warning, and two actions:
 * Cancel (close without applying) and Confirm Apply (re-POSTs with the
 * confirm_token). On 200 calls onSuccess + closes. On 403 again (expired/used
 * token) shows an inline retry error prompting the user to dismiss and re-start
 * the apply flow. On 409 CONFLICT shows the conflicting card id inline.
 *
 * Accessible: role="dialog", aria-modal, aria-labelledby, Esc to cancel,
 * overlay click to cancel. Max 300 LOC.
 */
export function ConfirmApplyModal({
  docId,
  findingId,
  confirmDetail,
  onClose,
  onSuccess,
}: ConfirmApplyModalProps) {
  const [inlineError, setInlineError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      applyFinding(docId, {
        finding_id: findingId,
        confirm_token: confirmDetail.confirm_token,
      }),
    onSuccess: () => {
      setInlineError(null);
      onSuccess();
    },
    onError: (err: unknown) => {
      if (isConfirmRequiredError(err)) {
        // Token expired or already used — prompt user to retry the whole flow.
        setInlineError(
          "Confirmation token expired or already used. Please close and click Apply again.",
        );
        return;
      }
      if (isConflictError(err)) {
        const cid = err.detail?.conflicting_card?.id;
        setInlineError(`Conflict: target already applied in card "${cid ?? "unknown"}". Cannot apply again.`);
        return;
      }
      const e = err as { message?: string } | null;
      setInlineError(e?.message ?? "Apply failed. Please try again.");
    },
  });

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  function handleOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const isPending = mutation.isPending;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-apply-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "28px 24px",
          maxWidth: "480px",
          width: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h2
            id="confirm-apply-title"
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text)",
              margin: 0,
            }}
          >
            Confirm framework apply
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0 }}>
            This will mark the finding as applied in the triage card.
          </p>
        </div>

        {/* Target file */}
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Target file (gold framework)
          </span>
          <code
            style={{
              fontSize: "12px",
              color: "var(--gov-framework)",
              wordBreak: "break-all",
              lineHeight: 1.5,
            }}
          >
            {confirmDetail.target_file}
          </code>
        </div>

        {/* Blast-radius warning */}
        <div
          role="note"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--warning)",
            borderRadius: "6px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--warning)",
            }}
          >
            Framework-level change (blast radius)
          </span>
          <p style={{ fontSize: "12px", color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            This authorizes a change to a shared framework file. The change affects all
            projects that use this vault. Confirm only if you have reviewed the finding
            and its target.
          </p>
        </div>

        {/* Token expiry info */}
        <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
          Confirmation token expires at{" "}
          <time dateTime={confirmDetail.expires_at}>
            {new Date(confirmDetail.expires_at).toLocaleTimeString()}
          </time>
          . If expired, close and click Apply again.
        </p>

        {/* Inline error (expired/conflict/general) */}
        {inlineError !== null && (
          <p
            role="alert"
            style={{
              fontSize: "12px",
              color: "var(--accent)",
              margin: 0,
              padding: "8px 12px",
              border: "1px solid var(--accent)",
              borderRadius: "6px",
              background: "var(--surface-2)",
            }}
          >
            {inlineError}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-disabled={isPending}
            style={{
              fontSize: "13px",
              padding: "7px 18px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-2)",
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setInlineError(null);
              mutation.mutate();
            }}
            disabled={isPending}
            aria-disabled={isPending}
            style={{
              fontSize: "13px",
              padding: "7px 18px",
              borderRadius: "6px",
              border: "1px solid var(--gov-framework)",
              background: "var(--surface-2)",
              color: "var(--gov-framework)",
              fontWeight: 600,
              cursor: isPending ? "wait" : "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? "Applying…" : "Confirm Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
