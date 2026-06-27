import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProjectConfig } from "@kuraka-control/contracts";
import { ConfigCard, buildConfigRows } from "./ConfigCard.js";

/**
 * ConfigCard unit tests (AC-T3 / story REQ-20260622-S3).
 * Covers:
 *   - Full config renders all rows
 *   - Absent rows are hidden when source fields are null/empty
 *   - config === null renders empty-state panel (no crash)
 *   - buildConfigRows is the exported module-level function (LL-009)
 */

afterEach(() => {
  cleanup();
});

function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    backend_language: "typescript",
    backend_framework: "express",
    frontend_language: "typescript",
    frontend_framework: "react",
    architecture_layers: ["api", "service", "repository"],
    state_mgmt: "zustand",
    naming_language: "english",
    max_file_loc: 400,
    max_function_loc: 50,
    default_mode: "normal",
    ...overrides,
  };
}

// ── Full config ───────────────────────────────────────────────────────────────

describe("ConfigCard — full config", () => {
  it("renders the card header", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Configuration")).toBeTruthy();
  });

  it("renders Stack backend row with lang / framework joined", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Stack backend")).toBeTruthy();
    expect(screen.getByText("typescript / express")).toBeTruthy();
  });

  it("renders Stack frontend row", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Stack frontend")).toBeTruthy();
    expect(screen.getByText("typescript / react")).toBeTruthy();
  });

  it("renders Architecture row with layers joined by ' → '", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Architecture")).toBeTruthy();
    expect(screen.getByText("api → service → repository")).toBeTruthy();
  });

  it("renders Store row", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Store")).toBeTruthy();
    expect(screen.getByText("zustand")).toBeTruthy();
  });

  it("renders Naming row", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Naming")).toBeTruthy();
    expect(screen.getByText("english")).toBeTruthy();
  });

  it("renders Limits row with file and fn LOC", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Limits")).toBeTruthy();
    expect(screen.getByText("file 400 · fn 50")).toBeTruthy();
  });

  it("renders Workflow row", () => {
    render(<ConfigCard config={makeConfig()} />);
    expect(screen.getByText("Workflow")).toBeTruthy();
    expect(screen.getByText("normal")).toBeTruthy();
  });
});

// ── Absent rows are hidden ────────────────────────────────────────────────────

describe("ConfigCard — absent fields hide their rows", () => {
  it("hides Stack backend row when both backend fields are null", () => {
    render(
      <ConfigCard
        config={makeConfig({ backend_language: null, backend_framework: null })}
      />,
    );
    expect(screen.queryByText("Stack backend")).toBeNull();
  });

  it("shows Stack backend row with only language when framework is null", () => {
    render(
      <ConfigCard config={makeConfig({ backend_framework: null })} />,
    );
    expect(screen.getByText("Stack backend")).toBeTruthy();
    expect(screen.getByText("typescript")).toBeTruthy();
  });

  it("shows Stack backend row with only framework when language is null", () => {
    render(
      <ConfigCard config={makeConfig({ backend_language: null })} />,
    );
    expect(screen.getByText("Stack backend")).toBeTruthy();
    expect(screen.getByText("express")).toBeTruthy();
  });

  it("hides Architecture row when layers array is empty", () => {
    render(
      <ConfigCard config={makeConfig({ architecture_layers: [] })} />,
    );
    expect(screen.queryByText("Architecture")).toBeNull();
  });

  it("hides Store row when state_mgmt is null", () => {
    render(<ConfigCard config={makeConfig({ state_mgmt: null })} />);
    expect(screen.queryByText("Store")).toBeNull();
  });

  it("hides Naming row when naming_language is null", () => {
    render(<ConfigCard config={makeConfig({ naming_language: null })} />);
    expect(screen.queryByText("Naming")).toBeNull();
  });

  it("hides Limits row when both max fields are null", () => {
    render(
      <ConfigCard
        config={makeConfig({ max_file_loc: null, max_function_loc: null })}
      />,
    );
    expect(screen.queryByText("Limits")).toBeNull();
  });

  it("renders Limits row with only file LOC when fn is null", () => {
    render(
      <ConfigCard config={makeConfig({ max_function_loc: null })} />,
    );
    expect(screen.getByText("file 400")).toBeTruthy();
  });

  it("renders Limits row with only fn LOC when file is null", () => {
    render(
      <ConfigCard config={makeConfig({ max_file_loc: null })} />,
    );
    expect(screen.getByText("fn 50")).toBeTruthy();
  });

  it("hides Workflow row when default_mode is null", () => {
    render(<ConfigCard config={makeConfig({ default_mode: null })} />);
    expect(screen.queryByText("Workflow")).toBeNull();
  });

  it("never displays the literal string 'null'", () => {
    render(
      <ConfigCard
        config={makeConfig({
          backend_language: null,
          backend_framework: null,
          frontend_language: null,
          frontend_framework: null,
          architecture_layers: [],
          state_mgmt: null,
          naming_language: null,
          max_file_loc: null,
          max_function_loc: null,
          default_mode: null,
        })}
      />,
    );
    const allText = document.body.textContent ?? "";
    expect(allText).not.toContain("null");
  });
});

// ── Empty state (config === null) ─────────────────────────────────────────────

describe("ConfigCard — config === null renders empty panel", () => {
  it("renders the empty-state message when config is null", () => {
    render(<ConfigCard config={null} />);
    // The message spans a <code> element inside a <p>, so match only the <p> node
    // via its combined textContent (regex on content alone would fail across child elements).
    const el = screen.getByText((_content, node) => {
      if (!node || node.nodeName !== "P") return false;
      const text = node.textContent ?? "";
      return text.includes("No") && text.includes("kuraka.config.yaml");
    });
    expect(el).toBeTruthy();
  });

  it("renders the secondary empty-state line", () => {
    render(<ConfigCard config={null} />);
    expect(
      screen.getByText("This project has no Kuraka config file."),
    ).toBeTruthy();
  });

  it("does NOT render the Configuration header when config is null", () => {
    render(<ConfigCard config={null} />);
    expect(screen.queryByText("Configuration")).toBeNull();
  });
});

// ── buildConfigRows (exported, LL-009) ────────────────────────────────────────

describe("buildConfigRows — exported mapping function", () => {
  it("returns 7 rows for a full config", () => {
    const rows = buildConfigRows(makeConfig());
    expect(rows).toHaveLength(7);
  });

  it("returns 0 rows when all optional fields are absent", () => {
    const rows = buildConfigRows(
      makeConfig({
        backend_language: null,
        backend_framework: null,
        frontend_language: null,
        frontend_framework: null,
        architecture_layers: [],
        state_mgmt: null,
        naming_language: null,
        max_file_loc: null,
        max_function_loc: null,
        default_mode: null,
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("labels and values match the Pencil design mapping", () => {
    const rows = buildConfigRows(makeConfig());
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(map["Stack backend"]).toBe("typescript / express");
    expect(map["Stack frontend"]).toBe("typescript / react");
    expect(map["Architecture"]).toBe("api → service → repository");
    expect(map["Store"]).toBe("zustand");
    expect(map["Naming"]).toBe("english");
    expect(map["Limits"]).toBe("file 400 · fn 50");
    expect(map["Workflow"]).toBe("normal");
  });
});
