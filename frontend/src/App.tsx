/**
 * App shell — skeleton seeded by arki. Real screens (Monitor, Project Detail,
 * Triage, Agentes, Onboard) and routing arrive via /kuraka cycles, starting
 * with S12 (design system) then S1 (registry → projects list/detail).
 */
import { useQuery } from "@tanstack/react-query";

interface Health {
  ok: boolean;
  service: string;
  vaultRoot: string;
  vaultReadable: boolean;
}

export function App() {
  const { data, isLoading, isError } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("backend unreachable");
      return res.json();
    },
  });

  return (
    <main
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ color: "var(--accent)" }}>Kuraka Control</h1>
      <p style={{ color: "var(--text-2)" }}>
        Control plane skeleton. Screens arrive via <code>/kuraka</code> cycles.
      </p>
      {isLoading && <p>checking backend…</p>}
      {isError && <p style={{ color: "var(--gov-project)" }}>backend unreachable</p>}
      {data && (
        <p>
          backend ok · vault{" "}
          <span style={{ color: data.vaultReadable ? "var(--jade)" : "var(--accent)" }}>
            {data.vaultReadable ? "readable" : "not found"}
          </span>{" "}
          <code style={{ color: "var(--text-3)" }}>{data.vaultRoot}</code>
        </p>
      )}
    </main>
  );
}
