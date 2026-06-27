import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLayerFile } from "../api/projectLayer.js";

/** Check error name instead of instanceof so mocks work correctly in tests. */
function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && err.name === "ForbiddenError";
}

function isLayerNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.name === "LayerNotFoundError";
}

function isNonRetryableError(err: unknown): boolean {
  return isForbiddenError(err) || isLayerNotFoundError(err);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── State panels ──────────────────────────────────────────────────────────────

const hintStyle: CSSProperties = {
  color: "var(--text-3)",
  fontSize: "13px",
  padding: "48px 24px",
  textAlign: "center",
};

function HintText({ children }: { children: ReactNode }) {
  return <p style={hintStyle}>{children}</p>;
}

// ── LayerPreview ──────────────────────────────────────────────────────────────

interface LayerPreviewProps {
  name: string;
  selectedRel: string | null;
}

/**
 * LayerPreview — preview pane for a selected layer file.
 * Renders to the right of LayerCard (flex-1, same card chrome).
 * 7 mutually exclusive states: nothing-selected, loading, content,
 * too-large, binary, forbidden (403), not-found (404).
 * Fetches via useQuery keyed on [name, "layerFile", selectedRel].
 * No hardcoded colors — all via CSS vars.
 */
export function LayerPreview({ name, selectedRel }: LayerPreviewProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["layerFile", name, selectedRel],
    queryFn: () => fetchLayerFile(name, selectedRel!),
    enabled: selectedRel !== null,
    retry: (failureCount, err) => {
      if (isNonRetryableError(err)) return false;
      return failureCount < 2;
    },
  });

  const isForbidden = isError && isForbiddenError(error);
  const isNotFound = isError && isLayerNotFoundError(error);

  function renderContent() {
    if (selectedRel === null) {
      return <HintText>Select a file to preview</HintText>;
    }

    if (isLoading) {
      return <HintText>Loading…</HintText>;
    }

    if (isForbidden) {
      return <HintText>Access forbidden</HintText>;
    }

    if (isNotFound) {
      return <HintText>File not found</HintText>;
    }

    if (isError) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return <HintText>{message}</HintText>;
    }

    if (data) {
      if (data.too_large) {
        return (
          <HintText>
            File too large to preview · {formatBytes(data.size_bytes)}
          </HintText>
        );
      }

      if (data.binary) {
        return <HintText>Binary file — cannot preview</HintText>;
      }

      return (
        <pre
          style={{
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            color: "var(--text)",
            background: "var(--surface)",
            fontSize: "12px",
            lineHeight: "1.6",
            margin: 0,
            padding: 0,
          }}
        >
          {data.content ?? ""}
        </pre>
      );
    }

    return null;
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card, 10px)",
        padding: "24px",
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          paddingBottom: "14px",
          borderBottom: "1px solid var(--border)",
          marginBottom: "16px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: selectedRel ? "var(--text)" : "var(--text-3)",
            fontSize: "13px",
            fontFamily: "monospace",
          }}
        >
          {selectedRel ?? "No file selected"}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {renderContent()}
      </div>
    </div>
  );
}
