import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LayerTreeResponse } from "@kuraka-control/contracts";
import { LayerCard } from "./LayerCard.js";

/**
 * LayerCard unit tests (AC F12 — story REQ-20260624-S4b).
 * Covers:
 *   - empty-state when has_layer is false
 *   - dir and file nodes render with correct text labels
 *   - "Tree truncated" note when truncated is true
 *   - clicking a file node calls onFileSelect callback
 */

afterEach(() => {
  cleanup();
});

function makeTree(overrides: Partial<LayerTreeResponse> = {}): LayerTreeResponse {
  return {
    has_layer: true,
    root_rel: ".claude/project",
    nodes: [],
    empty: true,
    truncated: false,
    ...overrides,
  };
}

const SAMPLE_NODES: LayerTreeResponse["nodes"] = [
  {
    name: "conventions",
    type: "dir",
    rel_path: "conventions",
    size_bytes: null,
    children: [
      {
        name: "typescript.md",
        type: "file",
        rel_path: "conventions/typescript.md",
        size_bytes: 1234,
      },
    ],
  },
  {
    name: "glossary.md",
    type: "file",
    rel_path: "glossary.md",
    size_bytes: 512,
  },
];

// ── Empty state (has_layer: false) ────────────────────────────────────────────

describe("LayerCard — has_layer: false", () => {
  it("renders empty-state message when has_layer is false", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText(/No project layer found for this project/i)).toBeTruthy();
  });

  it("renders header with root_rel", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText(".claude/project")).toBeTruthy();
  });
});

// ── Node rendering ────────────────────────────────────────────────────────────

describe("LayerCard — dir and file nodes", () => {
  it("renders dir node label", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText("conventions")).toBeTruthy();
  });

  it("renders file node label inside a dir", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText("typescript.md")).toBeTruthy();
  });

  it("renders top-level file node label", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText("glossary.md")).toBeTruthy();
  });
});

// ── Truncated note ────────────────────────────────────────────────────────────

describe("LayerCard — truncated flag", () => {
  it("does NOT render truncated note when truncated is false", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false, truncated: false })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.queryByText(/Tree truncated/i)).toBeNull();
  });

  it("renders 'Tree truncated (cap reached).' when truncated is true", () => {
    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false, truncated: true })}
        onFileSelect={vi.fn()}
        selectedRel={null}
      />,
    );
    expect(screen.getByText(/Tree truncated \(cap reached\)\./i)).toBeTruthy();
  });
});

// ── File select callback ──────────────────────────────────────────────────────

describe("LayerCard — onFileSelect callback", () => {
  it("calls onFileSelect with rel_path when a top-level file node is clicked", () => {
    const onFileSelect = vi.fn();

    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={onFileSelect}
        selectedRel={null}
      />,
    );

    fireEvent.click(screen.getByText("glossary.md"));
    expect(onFileSelect).toHaveBeenCalledWith("glossary.md");
  });

  it("calls onFileSelect with nested file rel_path", () => {
    const onFileSelect = vi.fn();

    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={onFileSelect}
        selectedRel={null}
      />,
    );

    fireEvent.click(screen.getByText("typescript.md"));
    expect(onFileSelect).toHaveBeenCalledWith("conventions/typescript.md");
  });

  it("does NOT call onFileSelect when a dir node is clicked", () => {
    const onFileSelect = vi.fn();

    render(
      <LayerCard
        tree={makeTree({ has_layer: true, nodes: SAMPLE_NODES, empty: false })}
        onFileSelect={onFileSelect}
        selectedRel={null}
      />,
    );

    fireEvent.click(screen.getByText("conventions"));
    expect(onFileSelect).not.toHaveBeenCalled();
  });
});
