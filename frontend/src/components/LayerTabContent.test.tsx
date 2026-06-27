import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayerTabContent } from "./LayerTabContent.js";

/**
 * LayerTabContent unit tests (MINOR Phase-5 fix — story REQ-20260624-S4b).
 * Covers:
 *   - when enabled=false, fetchLayerTree is NOT called and no loading text appears
 *   - when enabled=true and fetchLayerTree resolves has_layer:false, the no-layer empty panel renders
 */

// Hoist the mock so it runs before imports
const mockFetchLayerTree = vi.fn();

vi.mock("../api/projectLayer.js", () => ({
  fetchLayerTree: (...args: unknown[]) => mockFetchLayerTree(...args),
  fetchLayerFile: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    readonly name = "ForbiddenError";
    constructor(rel: string) {
      super(`Access forbidden for path: ${rel}`);
    }
  },
  LayerNotFoundError: class LayerNotFoundError extends Error {
    readonly name = "LayerNotFoundError";
    constructor(rel: string) {
      super(`Layer file not found: ${rel}`);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLayerTabContent(props: { name: string; enabled?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LayerTabContent {...props} />
    </QueryClientProvider>,
  );
}

// ── enabled=false: fetch is suppressed ───────────────────────────────────────

describe("LayerTabContent — enabled=false", () => {
  it("does NOT call fetchLayerTree when enabled is false", () => {
    renderLayerTabContent({ name: "kuraka-control", enabled: false });
    expect(mockFetchLayerTree).not.toHaveBeenCalled();
  });

  it("does not render loading text when enabled is false", () => {
    renderLayerTabContent({ name: "kuraka-control", enabled: false });
    expect(screen.queryByText(/Loading layer/i)).toBeNull();
  });
});

// ── enabled=true + has_layer:false → empty panel ──────────────────────────────

describe("LayerTabContent — enabled=true, has_layer:false", () => {
  it("renders the no-layer empty panel when has_layer is false", async () => {
    mockFetchLayerTree.mockResolvedValue({
      has_layer: false,
      root_rel: ".claude/project",
      nodes: [],
      empty: true,
      truncated: false,
    });

    renderLayerTabContent({ name: "kuraka-control", enabled: true });

    await waitFor(() => {
      expect(
        screen.getByText(/No project layer · this project has no \.claude\/project\/ directory/i),
      ).toBeTruthy();
    });
  });

  it("calls fetchLayerTree with the project name when enabled is true", async () => {
    mockFetchLayerTree.mockResolvedValue({
      has_layer: false,
      root_rel: ".claude/project",
      nodes: [],
      empty: true,
      truncated: false,
    });

    renderLayerTabContent({ name: "kuraka-control" });

    await waitFor(() => {
      expect(mockFetchLayerTree).toHaveBeenCalledWith("kuraka-control");
    });
  });
});
