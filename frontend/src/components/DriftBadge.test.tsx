import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Drift } from "@kuraka-control/contracts";
import { DriftBadge, DRIFT_DISPLAY_MAP } from "./DriftBadge.js";

/**
 * DriftBadge unit tests (AC-38).
 * Covers: each DriftState label, version hint for behind/ahead, registry chip,
 * and that DRIFT_DISPLAY_MAP is the exported constant (not re-declared inline).
 */

afterEach(() => {
  cleanup();
});

function makeDrift(overrides: Partial<Drift> = {}): Drift {
  return {
    state: "up_to_date",
    lock_version: "0.3.4",
    vault_version: "0.3.4",
    registry_version: "0.3.4",
    registry_matches_lock: true,
    ...overrides,
  };
}

describe("DriftBadge — each DriftState renders the correct label", () => {
  it('renders "up to date" for up_to_date state', () => {
    render(<DriftBadge drift={makeDrift({ state: "up_to_date" })} />);
    expect(screen.getByText("up to date")).toBeTruthy();
  });

  it('renders base label only when null versions are present (no version hint appended)', () => {
    // Uses "unknown" state because null versions are semantically valid there;
    // "behind"/"ahead" require non-null versions per SCHEMA-FROZEN-S2 §1.
    // This covers the buildLabel fallback path that returns the base label without a hint.
    render(
      <DriftBadge
        drift={makeDrift({
          state: "unknown",
          lock_version: null,
          vault_version: null,
          registry_matches_lock: null,
        })}
      />,
    );
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  it('renders "ahead" label for ahead state (no versions)', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "ahead",
          lock_version: null,
          vault_version: null,
        })}
      />,
    );
    expect(screen.getByText("ahead")).toBeTruthy();
  });

  it('renders "not pinned" for not_pinned state', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "not_pinned",
          lock_version: null,
          registry_matches_lock: null,
        })}
      />,
    );
    expect(screen.getByText("not pinned")).toBeTruthy();
  });

  it('renders "unknown" for unknown state', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "unknown",
          lock_version: "latest",
          vault_version: null,
          registry_matches_lock: null,
        })}
      />,
    );
    expect(screen.getByText("unknown")).toBeTruthy();
  });
});

describe("DriftBadge — version hint for behind/ahead", () => {
  it('shows "behind · {lock} → {vault}" when both versions are non-null', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "behind",
          lock_version: "0.3.2",
          vault_version: "0.3.4",
        })}
      />,
    );
    expect(screen.getByText("behind · 0.3.2 → 0.3.4")).toBeTruthy();
  });

  it('shows "ahead · {lock} → {vault}" when both versions are non-null', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "ahead",
          lock_version: "0.4.0",
          vault_version: "0.3.4",
        })}
      />,
    );
    expect(screen.getByText("ahead · 0.4.0 → 0.3.4")).toBeTruthy();
  });

  it('shows just "behind" when lock_version is null', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "behind",
          lock_version: null,
          vault_version: "0.3.4",
        })}
      />,
    );
    expect(screen.getByText("behind")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });
});

describe("DriftBadge — registry chip", () => {
  it('renders "registry stamp out of date" chip when registry_matches_lock is false', () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "up_to_date",
          lock_version: "0.3.4",
          vault_version: "0.3.4",
          registry_version: "0.3.3",
          registry_matches_lock: false,
        })}
      />,
    );
    expect(screen.getByText("registry stamp out of date")).toBeTruthy();
  });

  it("does not render the chip when registry_matches_lock is true", () => {
    render(<DriftBadge drift={makeDrift({ registry_matches_lock: true })} />);
    expect(screen.queryByText("registry stamp out of date")).toBeNull();
  });

  it("does not render the chip when registry_matches_lock is null", () => {
    render(
      <DriftBadge
        drift={makeDrift({
          state: "not_pinned",
          lock_version: null,
          registry_matches_lock: null,
        })}
      />,
    );
    expect(screen.queryByText("registry stamp out of date")).toBeNull();
  });
});

describe("DriftBadge — DRIFT_DISPLAY_MAP is the exported module-level constant", () => {
  it("exports DRIFT_DISPLAY_MAP with all five drift states", () => {
    const keys = Object.keys(DRIFT_DISPLAY_MAP);
    expect(keys).toContain("up_to_date");
    expect(keys).toContain("behind");
    expect(keys).toContain("ahead");
    expect(keys).toContain("not_pinned");
    expect(keys).toContain("unknown");
  });

  it("maps up_to_date to jade variant", () => {
    expect(DRIFT_DISPLAY_MAP.up_to_date.variant).toBe("jade");
  });

  it("maps behind to warning variant", () => {
    expect(DRIFT_DISPLAY_MAP.behind.variant).toBe("warning");
  });

  it("maps ahead to accent variant", () => {
    expect(DRIFT_DISPLAY_MAP.ahead.variant).toBe("accent");
  });

  it("maps not_pinned to muted variant", () => {
    expect(DRIFT_DISPLAY_MAP.not_pinned.variant).toBe("muted");
  });

  it("maps unknown to muted variant", () => {
    expect(DRIFT_DISPLAY_MAP.unknown.variant).toBe("muted");
  });
});
