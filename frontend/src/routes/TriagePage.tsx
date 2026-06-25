import { useQuery } from "@tanstack/react-query";
import type { TriageListResponse } from "@kuraka-control/contracts";
import { fetchTriage } from "../api/triage.js";
import { AppShell } from "../components/AppShell.js";
import { TriageCard } from "../components/TriageCard.js";

// ── Loading skeleton ──────────────────────────────────────────────────────────

function TriageGridSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            width: "240px",
            height: "140px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
          }}
        />
      ))}
    </div>
  );
}

// ── Error panel ───────────────────────────────────────────────────────────────

function VaultErrorPanel({ error }: { error: unknown }) {
  const vaultPath =
    (error as { detail?: { path?: string } } | null)?.detail?.path ?? null;

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--accent)",
        maxWidth: "480px",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Cannot read the Kuraka vault
      </p>
      {vaultPath !== null && (
        <p className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
          {vaultPath}
        </p>
      )}
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        Check that <code>KURAKA_VAULT</code> points to a readable directory and
        restart the backend.
      </p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col gap-2 p-6 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        maxWidth: "480px",
      }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
        No triage cards yet.
      </p>
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        Add a <code>.md</code> file to{" "}
        <code>{"<vault>/retro-triage/"}</code> to create triage records.
      </p>
    </div>
  );
}

// ── TriagePage ────────────────────────────────────────────────────────────────

/**
 * TriagePage — /triage route.
 * Layout: AppShell + main area.
 * Fetches GET /api/triage; flattens docs[].findings[] into individual cards.
 * States: loading → skeleton | error → vault panel | empty → empty state | happy → grid.
 */
export function TriagePage() {
  const { data, isLoading, isError, error } = useQuery<TriageListResponse, Error>({
    queryKey: ["triage"],
    queryFn: fetchTriage,
  });

  // Flatten all findings across docs into a flat card list.
  const cards =
    data?.docs.flatMap((doc) =>
      doc.findings.map((finding) => ({
        finding,
        docId: doc.id,
        docProject: doc.project,
        docDate: doc.date,
      })),
    ) ?? [];

  const totalFindings = cards.length;

  return (
    <AppShell activePath="/triage">
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ padding: "32px", gap: "24px" }}
      >
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--text)" }}
            >
              RETRO Triage
            </h1>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              {isLoading
                ? "Vault · retro-triage"
                : isError
                ? "Vault · retro-triage"
                : `Vault · retro-triage · ${totalFindings} finding${totalFindings !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Content area */}
        {isLoading && <TriageGridSkeleton />}

        {isError && <VaultErrorPanel error={error} />}

        {!isLoading && !isError && data?.empty === true && <EmptyState />}

        {!isLoading && !isError && data && !data.empty && cards.length === 0 && (
          <EmptyState />
        )}

        {!isLoading && !isError && data && cards.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            {cards.map((card, idx) => (
              <TriageCard
                key={`${card.docId}-${card.finding.id ?? idx}`}
                finding={card.finding}
                docId={card.docId}
                docProject={card.docProject}
                docDate={card.docDate}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
