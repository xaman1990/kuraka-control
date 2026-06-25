import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { TriageDoc, TriageListResponse } from "@kuraka-control/contracts";
import { fetchTriage } from "../api/triage.js";
import { AppShell } from "../components/AppShell.js";
import { Badge } from "../components/Badge.js";
import { GovernanceBadge } from "../components/GovernanceBadge.js";
import { severityVariant } from "../components/TriageCard.js";

// ── Routing badge helper (mirrors TriageCard, no duplication of logic) ─────────

function RoutingBadge({ routing }: { routing: string | null }) {
  if (routing === null) {
    return <Badge variant="neutral">—</Badge>;
  }
  const lower = routing.toLowerCase();
  if (lower.includes("framework")) {
    return <GovernanceBadge governance="framework" label={routing} />;
  }
  return <GovernanceBadge governance="project" label={routing} />;
}

// ── Status badge helper ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (status === null) return <Badge variant="neutral">—</Badge>;
  const lower = status.toLowerCase();
  if (lower === "applied") return <Badge variant="jade">{status}</Badge>;
  if (lower === "pending") return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

// ── Loading / error / not-found panels ───────────────────────────────────────

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center flex-1" style={{ color: "var(--text-2)" }}>
      <p className="text-sm">Loading…</p>
    </div>
  );
}

function NotFoundPanel({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
      <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
        Triage doc not found
      </p>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        No doc with id <code>{id}</code> in the vault.
      </p>
      <Link to="/triage" className="text-xs mt-2 hover:underline" style={{ color: "var(--jade)" }}>
        Back to RETRO Triage
      </Link>
    </div>
  );
}

function VaultErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--accent)", maxWidth: "480px" }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Could not load triage data
      </p>
      <p className="text-xs" style={{ color: "var(--text-2)" }}>{message}</p>
    </div>
  );
}

// ── Doc meta header ───────────────────────────────────────────────────────────

function DocMeta({ doc }: { doc: TriageDoc }) {
  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
        <Link to="/triage" className="hover:underline" style={{ color: "var(--text-3)" }}>
          RETRO Triage
        </Link>
        {" / "}
        <span>{doc.id}</span>
      </p>

      {/* Title */}
      <h1 className="font-bold" style={{ color: "var(--text)", fontSize: "22px", lineHeight: 1.2 }}>
        {doc.project ?? doc.id}
      </h1>

      {/* Meta pills */}
      <div className="flex flex-wrap gap-3 items-center">
        {doc.date !== null && (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>{doc.date}</span>
        )}
        {doc.source !== null && (
          <Badge variant="muted">{doc.source}</Badge>
        )}
        {doc.decision !== null && (
          <StatusBadge status={doc.decision} />
        )}
        {doc.applied !== null && (
          <Badge variant={doc.applied ? "jade" : "neutral"}>
            {doc.applied ? "applied" : "not applied"}
          </Badge>
        )}
        {doc.tags.length > 0 && doc.tags.map((tag) => (
          <Badge key={tag} variant="neutral">{tag}</Badge>
        ))}
      </div>
    </div>
  );
}

// ── Findings table ────────────────────────────────────────────────────────────

function FindingsTable({ doc }: { doc: TriageDoc }) {
  if (doc.findings.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        No findings in this triage doc.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr>
            {["#", "Finding", "Routing", "Target file", "Severity", "Status"].map((col) => (
              <th
                key={col}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-3)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.findings.map((f, idx) => (
            <tr key={f.id ?? idx} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {f.id ?? "—"}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text)", maxWidth: "360px" }}>
                {f.finding ?? "—"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <RoutingBadge routing={f.routing} />
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  color: "var(--text-3)",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  maxWidth: "240px",
                  wordBreak: "break-all",
                }}
              >
                {f.target_file ?? "—"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <Badge variant={severityVariant(f.severity)}>
                  {f.severity ?? "—"}
                </Badge>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <StatusBadge status={f.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Rationale block ───────────────────────────────────────────────────────────

function RationaleBlock({ rationale }: { rationale: string | null }) {
  if (rationale === null) return null;

  return (
    <div className="flex flex-col" style={{ gap: "10px" }}>
      <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
        Decisions &amp; rationale
      </h2>
      <pre
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "14px",
          fontSize: "13px",
          color: "var(--text-2)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}
      >
        {rationale}
      </pre>
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
      {children}
    </h2>
  );
}

// ── TriageDetailPage ──────────────────────────────────────────────────────────

/**
 * TriageDetailPage — /triage/:id route.
 *
 * Uses the shared ["triage"] react-query cache to find the doc by id.
 * No additional fetch is made. If the cache is cold (direct navigation),
 * fetchTriage is called transparently by useQuery.
 * Renders: doc meta, findings table, rationale prose.
 */
export function TriageDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, error } = useQuery<TriageListResponse, Error>({
    queryKey: ["triage"],
    queryFn: fetchTriage,
  });

  const doc = data?.docs.find((d) => d.id === id) ?? null;

  return (
    <AppShell activePath="/triage">
      {isLoading && <LoadingPanel />}

      {isError && (
        <div style={{ padding: "32px" }}>
          <VaultErrorPanel error={error} />
        </div>
      )}

      {!isLoading && !isError && doc === null && (
        <NotFoundPanel id={id ?? ""} />
      )}

      {!isLoading && !isError && doc !== null && (
        <div className="flex flex-col" style={{ padding: "32px", gap: "28px" }}>
          <DocMeta doc={doc} />

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          <div className="flex flex-col" style={{ gap: "12px" }}>
            <SectionLabel>Findings ({doc.findings.length})</SectionLabel>
            <FindingsTable doc={doc} />
          </div>

          <RationaleBlock rationale={doc.rationale} />
        </div>
      )}
    </AppShell>
  );
}
