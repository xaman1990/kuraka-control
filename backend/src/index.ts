/**
 * kuraka-control backend — Express entrypoint.
 *
 * Minimal runnable skeleton seeded by arki. Real routes (registry, project
 * detail, triage, governance runner, live SSE) arrive via /kuraka cycles per
 * the build order S12 → S1 → S2 → S3 → S4 → S5 → S7.
 *
 * Layers: route → service → repository → domain (docs/arquitectura/layers.md).
 */
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";

const app = express();
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api", projectsRouter);

app.listen(env.backendPort, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[kuraka-control] backend on :${env.backendPort} · vault=${env.vaultRoot}`,
  );
});
