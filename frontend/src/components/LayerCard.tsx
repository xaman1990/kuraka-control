import type { CSSProperties } from "react";
import { LayerNodeShape, LayerTreeResponse } from "@kuraka-control/contracts";

// ── Icons (inline SVG, no color literals) ────────────────────────────────────

interface IconProps {
  size: number;
  color: string;
}

function FolderIcon({ size, color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6l1.5 1.5H13.5A1 1 0 0 1 14.5 6V12A1 1 0 0 1 13.5 13H2.5A1 1 0 0 1 1.5 12V4.5Z"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function FileIcon({ size, color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M9.5 2H3.5A1 1 0 0 0 2.5 3V13A1 1 0 0 0 3.5 14H12.5A1 1 0 0 0 13.5 13V6L9.5 2Z"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
      />
      <path d="M9.5 2V6H13.5" stroke={color} strokeWidth="1.2" fill="none" />
    </svg>
  );
}

// ── Tree row ──────────────────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: LayerNodeShape;
  depth: number;
  selectedRel: string | null;
  onFileSelect: (rel: string) => void;
}

function TreeNodeRow({ node, depth, selectedRel, onFileSelect }: TreeNodeRowProps) {
  const indent = depth * 18;
  const isSelected = node.type === "file" && node.rel_path === selectedRel;

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    paddingLeft: `${indent}px`,
    paddingTop: "4px",
    paddingBottom: "4px",
    paddingRight: "8px",
    borderRadius: "4px",
    cursor: node.type === "file" ? "pointer" : "default",
    background: isSelected ? "var(--surface-2)" : "transparent",
  };

  const labelStyle: CSSProperties = {
    fontSize: "13px",
    color: node.type === "dir"
      ? "var(--text)"
      : isSelected
        ? "var(--text)"
        : "var(--text-2)",
    userSelect: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  function handleClick() {
    if (node.type === "file") {
      onFileSelect(node.rel_path);
    }
  }

  return (
    <>
      <div style={rowStyle} onClick={handleClick} role={node.type === "file" ? "button" : undefined}>
        {node.type === "dir" ? (
          <FolderIcon size={14} color="var(--jade)" />
        ) : (
          <FileIcon size={14} color="var(--text-3)" />
        )}
        <span style={labelStyle}>{node.name}</span>
      </div>
      {node.type === "dir" && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.rel_path}
              node={child}
              depth={depth + 1}
              selectedRel={selectedRel}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function LayerEmptyPanel() {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <p style={{ color: "var(--text-2)", fontSize: "14px", fontWeight: 500 }}>
        No project layer found for this project.
      </p>
      <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px" }}>
        This project has no <code>.claude/project/</code> directory.
      </p>
    </div>
  );
}

// ── LayerCard ─────────────────────────────────────────────────────────────────

interface LayerCardProps {
  tree: LayerTreeResponse;
  onFileSelect: (rel: string) => void;
  selectedRel: string | null;
}

/**
 * LayerCard — renders the .claude/project/ tree.
 * Pencil design: fill=$surface, stroke=$border, radius-card, padding=24, width=360.
 * Header: folder icon ($jade, 16px) + title ($text, 15px) ".claude/project".
 * Dir rows: jade icon (14px) + label ($text, 13px).
 * File rows: muted icon (14px) + label ($text-2, 13px); selected → $text + subtle bg.
 * When has_layer=false → LayerEmptyPanel.
 * When truncated=true → "(truncated)" hint at bottom.
 * No hardcoded colors — all via CSS vars.
 */
export function LayerCard({ tree, onFileSelect, selectedRel }: LayerCardProps) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card, 10px)",
        padding: "24px",
        width: "360px",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          paddingBottom: "14px",
        }}
      >
        <FolderIcon size={16} color="var(--jade)" />
        <span
          style={{
            color: "var(--text)",
            fontSize: "15px",
            fontWeight: 600,
          }}
        >
          {tree.root_rel}
        </span>
      </div>

      {/* Content */}
      {!tree.has_layer ? (
        <LayerEmptyPanel />
      ) : (
        <div>
          {tree.nodes.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "13px", padding: "8px 0" }}>
              Directory is empty.
            </p>
          ) : (
            <div>
              {tree.nodes.map((node) => (
                <TreeNodeRow
                  key={node.rel_path}
                  node={node}
                  depth={0}
                  selectedRel={selectedRel}
                  onFileSelect={onFileSelect}
                />
              ))}
            </div>
          )}

          {tree.truncated && (
            <p
              style={{
                color: "var(--text-3)",
                fontSize: "12px",
                marginTop: "12px",
                paddingTop: "8px",
                borderTop: "1px solid var(--border)",
              }}
            >
              Tree truncated (cap reached).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
