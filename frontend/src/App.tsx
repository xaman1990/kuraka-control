/**
 * App shell — bootstraps react-router-dom v6.
 * Routes:
 *   /                  — Landing (health probe)
 *   /showcase          — S12 design-system visual proof (Phase 6.8 smoke)
 *   /projects          — ProjectsPage (S1 registry)
 *   /projects/:name    — ProjectDetailShell (S1 placeholder)
 */
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Showcase } from "./routes/Showcase.js";
import { ProjectsPage } from "./routes/ProjectsPage.js";
import { ProjectDetailShell } from "./routes/ProjectDetailShell.js";

interface Health {
  ok: boolean;
  service: string;
  vaultRoot: string;
  vaultReadable: boolean;
}

function Landing() {
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
      <p style={{ color: "var(--text-2)", marginTop: "1rem" }}>
        <Link to="/showcase" style={{ color: "var(--jade)" }}>
          /showcase
        </Link>{" "}
        — design system visual proof (S12)
      </p>
      <p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>
        <Link to="/projects" style={{ color: "var(--jade)" }}>
          /projects
        </Link>{" "}
        — vault registry (S1)
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

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:name" element={<ProjectDetailShell />} />
      </Routes>
    </BrowserRouter>
  );
}
