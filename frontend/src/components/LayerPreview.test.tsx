import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayerFileResponse } from "@kuraka-control/contracts";
import { LayerPreview } from "./LayerPreview.js";

/**
 * LayerPreview unit tests (AC F13 — story REQ-20260624-S4b).
 * Covers:
 *   - nothing-selected hint when selectedRel is null
 *   - content rendered in <pre> when response has content string
 *   - too-large state when too_large is true
 *   - binary state when binary is true
 *   - forbidden state when ForbiddenError is thrown
 *   - not-found state when LayerNotFoundError is thrown
 */

// Hoist the mock so it runs before imports
const mockFetchLayerFile = vi.fn();

vi.mock("../api/projectLayer.js", () => ({
  fetchLayerFile: (...args: unknown[]) => mockFetchLayerFile(...args),
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

function makeFileResponse(overrides: Partial<LayerFileResponse> = {}): LayerFileResponse {
  return {
    rel_path: "conventions/typescript.md",
    name: "typescript.md",
    content: "# TypeScript conventions",
    size_bytes: 1234,
    truncated: false,
    too_large: false,
    binary: false,
    ...overrides,
  };
}

function renderPreview(selectedRel: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LayerPreview name="kuraka-control" selectedRel={selectedRel} />
    </QueryClientProvider>,
  );
}

// ── Nothing selected ──────────────────────────────────────────────────────────

describe("LayerPreview — nothing selected", () => {
  it("renders 'Select a file to preview' hint when selectedRel is null", () => {
    renderPreview(null);
    expect(screen.getByText("Select a file to preview")).toBeTruthy();
  });
});

// ── Content ───────────────────────────────────────────────────────────────────

describe("LayerPreview — content", () => {
  it("renders content in <pre> block", async () => {
    mockFetchLayerFile.mockResolvedValue(
      makeFileResponse({ content: "# TypeScript conventions" }),
    );

    renderPreview("conventions/typescript.md");

    await waitFor(() => {
      expect(screen.getByText("# TypeScript conventions")).toBeTruthy();
    });
  });

  it("renders content inside a pre element", async () => {
    mockFetchLayerFile.mockResolvedValue(
      makeFileResponse({ content: "# TypeScript conventions" }),
    );

    renderPreview("conventions/typescript.md");

    await waitFor(() => {
      const pre = document.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain("# TypeScript conventions");
    });
  });
});

// ── Too large ─────────────────────────────────────────────────────────────────

describe("LayerPreview — too_large", () => {
  it("renders too-large state message", async () => {
    mockFetchLayerFile.mockResolvedValue(
      makeFileResponse({ too_large: true, content: null, size_bytes: 2_097_152 }),
    );

    renderPreview("big-file.bin");

    await waitFor(() => {
      expect(screen.getByText(/File too large to preview/i)).toBeTruthy();
    });
  });
});

// ── Binary ────────────────────────────────────────────────────────────────────

describe("LayerPreview — binary", () => {
  it("renders 'Binary file — cannot preview' message", async () => {
    mockFetchLayerFile.mockResolvedValue(
      makeFileResponse({ binary: true, content: null }),
    );

    renderPreview("image.png");

    await waitFor(() => {
      expect(screen.getByText(/Binary file — cannot preview/i)).toBeTruthy();
    });
  });
});

// ── Forbidden ─────────────────────────────────────────────────────────────────

describe("LayerPreview — forbidden (403)", () => {
  it("renders 'Access forbidden' message", async () => {
    mockFetchLayerFile.mockRejectedValue(
      Object.assign(new Error("Access forbidden for path: ../etc/passwd"), {
        name: "ForbiddenError",
      }),
    );

    renderPreview("../etc/passwd");

    await waitFor(() => {
      expect(screen.getByText(/Access forbidden/i)).toBeTruthy();
    });
  });
});

// ── Not found ─────────────────────────────────────────────────────────────────

describe("LayerPreview — not found (404)", () => {
  it("renders 'File not found' message", async () => {
    mockFetchLayerFile.mockRejectedValue(
      Object.assign(new Error("Layer file not found: missing.md"), {
        name: "LayerNotFoundError",
      }),
    );

    renderPreview("missing.md");

    await waitFor(() => {
      expect(screen.getByText(/File not found/i)).toBeTruthy();
    });
  });
});
