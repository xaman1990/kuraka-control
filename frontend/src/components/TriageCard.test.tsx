import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TriageFinding } from "@kuraka-control/contracts";
import { TriageCard, SEVERITY_VARIANT_MAP, severityVariant } from "./TriageCard.js";

/**
 * TriageCard unit tests (AC T4).
 * Covers:
 *   - routing "framework" → gold governance badge (GovernanceBadge framework)
 *   - routing "project"   → jade governance badge (GovernanceBadge project)
 *   - routing null        → neutral Badge fallback
 *   - unknown severity    → neutral fallback (no crash)
 *   - known severity HIGH → accent variant
 *   - target_file rendered in monospace text
 *   - finding text rendered as title
 *   - SEVERITY_VARIANT_MAP exported at module level
 */

afterEach(() => {
  cleanup();
});

function makeFinding(overrides: Partial<TriageFinding> = {}): TriageFinding {
  return {
    id: "P1",
    finding: "Test finding description",
    routing: "project",
    target_file: "backend/src/domain/triage.ts",
    severity: "HIGH",
    status: "applied",
    ...overrides,
  };
}

function renderCard(finding: TriageFinding = makeFinding()) {
  return render(
    <MemoryRouter>
      <TriageCard
        finding={finding}
        docId="2026-06-06-sie_v2"
        docProject="sie_v2"
        docDate="2026-06-06"
      />
    </MemoryRouter>,
  );
}

describe("TriageCard — routing badge (two-color governance)", () => {
  it("renders GovernanceBadge for routing='framework' (gold governance)", () => {
    renderCard(makeFinding({ routing: "framework" }));
    // GovernanceBadge renders the label text
    expect(screen.getByText("framework")).toBeTruthy();
  });

  it("renders GovernanceBadge for routing='project' (jade governance)", () => {
    renderCard(makeFinding({ routing: "project" }));
    expect(screen.getByText("project")).toBeTruthy();
  });

  it("renders a neutral '—' badge when routing is null", () => {
    renderCard(makeFinding({ routing: null }));
    // Neutral badge renders '—'
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("treats routing value containing 'framework' as framework governance", () => {
    renderCard(makeFinding({ routing: "**framework**" }));
    // The card normalizes via .includes("framework") check
    expect(screen.getByText("**framework**")).toBeTruthy();
  });
});

describe("TriageCard — severity badge", () => {
  it("renders HIGH severity without crashing", () => {
    renderCard(makeFinding({ severity: "HIGH" }));
    expect(screen.getByText("HIGH")).toBeTruthy();
  });

  it("renders unknown severity string with neutral fallback (no crash)", () => {
    renderCard(makeFinding({ severity: "EXOTIC" }));
    expect(screen.getByText("EXOTIC")).toBeTruthy();
  });

  it("renders null severity as '—' without crashing", () => {
    renderCard(makeFinding({ severity: null }));
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe("TriageCard — content rendering", () => {
  it("renders the finding description text", () => {
    renderCard(makeFinding({ finding: "Fix the vault reader" }));
    expect(screen.getByText("Fix the vault reader")).toBeTruthy();
  });

  it("renders the target_file text", () => {
    renderCard(makeFinding({ target_file: "backend/src/domain/triage.ts" }));
    expect(screen.getByText("backend/src/domain/triage.ts")).toBeTruthy();
  });

  it("does not crash when target_file is null", () => {
    renderCard(makeFinding({ target_file: null }));
    // Simply must not throw
    expect(screen.queryByText("backend/src/domain/triage.ts")).toBeNull();
  });

  it("renders parent doc project + date context", () => {
    render(
      <MemoryRouter>
        <TriageCard
          finding={makeFinding()}
          docId="2026-06-06-sie_v2"
          docProject="sie_v2"
          docDate="2026-06-06"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("sie_v2 · 2026-06-06")).toBeTruthy();
  });
});

describe("TriageCard — SEVERITY_VARIANT_MAP export (LL-009)", () => {
  it("exports SEVERITY_VARIANT_MAP with HIGH mapped to accent", () => {
    expect(SEVERITY_VARIANT_MAP["HIGH"]).toBe("accent");
  });

  it("exports SEVERITY_VARIANT_MAP with MED mapped to warning", () => {
    expect(SEVERITY_VARIANT_MAP["MED"]).toBe("warning");
  });

  it("exports SEVERITY_VARIANT_MAP with LOW mapped to neutral", () => {
    expect(SEVERITY_VARIANT_MAP["LOW"]).toBe("neutral");
  });

  it("severityVariant returns neutral for unknown strings", () => {
    expect(severityVariant("VERY_EXOTIC")).toBe("neutral");
  });

  it("severityVariant returns neutral for null", () => {
    expect(severityVariant(null)).toBe("neutral");
  });

  it("severityVariant is case-insensitive for lookup", () => {
    // severityVariant does toUpperCase before lookup
    expect(severityVariant("high")).toBe("accent");
  });
});
