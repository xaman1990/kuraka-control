import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLayerTree } from "../api/projectLayer.js";
import { LayerCard } from "./LayerCard.js";
import { LayerPreview } from "./LayerPreview.js";

// ── LayerTabContent ───────────────────────────────────────────────────────────

interface LayerTabContentProps {
  name: string;
  enabled: boolean;
}

/**
 * LayerTabContent — Project Layer tab body.
 * Lazy-fetches the tree (enabled only when the tab is active).
 * Renders: loading, error, no-layer empty state, or tree + preview side-by-side.
 * Tree is 360px fixed width; preview is flex-1 (fills remaining width).
 */
export function LayerTabContent({ name, enabled }: LayerTabContentProps) {
  const [selectedRel, setSelectedRel] = useState<string | null>(null);

  const { data: tree, isLoading, isError, error } = useQuery({
    queryKey: ["layer", name],
    queryFn: () => fetchLayerTree(name),
    enabled,
  });

  if (isLoading) {
    return (
      <p style={{ color: "var(--text-2)", fontSize: "14px" }}>Loading layer…</p>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return (
      <div
        style={{
          padding: "16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card, 10px)",
        }}
      >
        <p style={{ color: "var(--accent)", fontSize: "13px", fontWeight: 600 }}>
          Could not load project layer
        </p>
        <p style={{ color: "var(--text-2)", fontSize: "12px", marginTop: "4px" }}>
          {message}
        </p>
      </div>
    );
  }

  if (!tree) {
    return null;
  }

  if (!tree.has_layer) {
    return (
      <div
        style={{
          padding: "48px 24px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card, 10px)",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--text-2)", fontSize: "14px", fontWeight: 500 }}>
          No project layer · this project has no .claude/project/ directory
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <LayerCard
        tree={tree}
        onFileSelect={setSelectedRel}
        selectedRel={selectedRel}
      />
      <LayerPreview name={name} selectedRel={selectedRel} />
    </div>
  );
}
