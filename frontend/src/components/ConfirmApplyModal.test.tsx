import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as triageApi from "../api/triage.js";
import { ConfirmApplyModal } from "./ConfirmApplyModal.js";
import type { ConfirmRequiredDetail } from "../api/triage.js";

/**
 * ConfirmApplyModal unit tests (S5b-2 AC31).
 *
 * Covers:
 *  - renders target_file and blast-radius warning
 *  - Cancel button calls onClose
 *  - Confirm Apply calls applyFinding with confirm_token on success
 *  - 403 expired/used token shows inline retry error inside modal
 *  - accessible attributes: role="dialog", aria-modal, aria-labelledby
 *
 * applyFinding is vi.spyOn-mocked so no real network calls happen.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeDetail(overrides: Partial<ConfirmRequiredDetail> = {}): ConfirmRequiredDetail {
  return {
    id: "2026-06-06-sie_v2",
    finding_id: "P2",
    target_file: "rules/no-matter-stringify.md",
    confirm_token: "fake.token",
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    ...overrides,
  };
}

interface ModalProps {
  docId?: string;
  findingId?: string;
  confirmDetail?: ConfirmRequiredDetail;
  onClose?: () => void;
  onSuccess?: () => void;
}

function renderModal(props: ModalProps = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const detail = props.confirmDetail ?? makeDetail();

  const result = render(
    <QueryClientProvider client={qc}>
      <ConfirmApplyModal
        docId={props.docId ?? "2026-06-06-sie_v2"}
        findingId={props.findingId ?? "P2"}
        confirmDetail={detail}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );

  return { onClose, onSuccess, detail, ...result };
}

// ── Rendering ──────────────────────────────────────────────────────────────────

describe("ConfirmApplyModal — rendering", () => {
  it("displays the target_file from confirmDetail", () => {
    renderModal();
    expect(screen.getByText("rules/no-matter-stringify.md")).toBeTruthy();
  });

  it("shows a blast-radius warning", () => {
    renderModal();
    expect(screen.getByText(/blast radius/i)).toBeTruthy();
  });

  it("renders a dialog with role=dialog and aria-modal=true", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("links aria-labelledby to a heading containing 'confirm'", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId ?? "");
    expect(heading?.textContent?.toLowerCase()).toContain("confirm");
  });

  it("shows Cancel and Confirm Apply buttons", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm apply/i })).toBeTruthy();
  });
});

// ── Cancel ─────────────────────────────────────────────────────────────────────

describe("ConfirmApplyModal — Cancel", () => {
  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Confirm Apply (happy path) ─────────────────────────────────────────────────

describe("ConfirmApplyModal — Confirm Apply success", () => {
  it("calls applyFinding with confirm_token and invokes onSuccess", async () => {
    const mockDoc = {
      id: "2026-06-06-sie_v2",
      project: "sie_v2",
      source: null,
      date: "2026-06-06",
      decision: "applied",
      applied: true,
      tags: [],
      findings: [],
      rationale: null,
    };
    const applySpy = vi
      .spyOn(triageApi, "applyFinding")
      .mockResolvedValueOnce({ doc: mockDoc });

    const { onSuccess } = renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm apply/i }));
    });

    expect(applySpy).toHaveBeenCalledWith("2026-06-06-sie_v2", {
      finding_id: "P2",
      confirm_token: "fake.token",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

// ── 403 expired/used token → inline error ─────────────────────────────────────

describe("ConfirmApplyModal — expired token", () => {
  it("shows inline retry error when applyFinding throws CONFIRM_REQUIRED", async () => {
    const expiredErr = Object.assign(new Error("Framework apply requires a confirm token."), {
      code: "CONFIRM_REQUIRED" as const,
      detail: {
        id: "2026-06-06-sie_v2",
        finding_id: "P2",
        target_file: "rules/no-matter-stringify.md",
        confirm_token: "fresh.token",
        expires_at: new Date(Date.now() + 120_000).toISOString(),
      },
    });
    vi.spyOn(triageApi, "applyFinding").mockRejectedValueOnce(expiredErr);

    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm apply/i }));
    });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/expired or already used/i)).toBeTruthy();
  });
});
