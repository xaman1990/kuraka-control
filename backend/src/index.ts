/**
 * kuraka-control backend — Express entrypoint.
 *
 * Minimal runnable skeleton seeded by arki. Real routes (registry, project
 * detail, triage, governance runner, live SSE) arrive via /kuraka cycles per
 * the build order S12 → S1 → S2 → S3 → S4 → S5 → S7.
 *
 * Layers: route → service → repository → domain (docs/arquitectura/layers.md).
 *
 * `createApp` is a pure factory — it builds the Express app and mounts all
 * routers but does NOT call `.listen()`. This makes the app testable: tests
 * import createApp, pass a temp vaultRoot, and spin up their own http.Server.
 */
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { createProjectsRouter } from "./routes/projects.js";

export interface AppOptions {
  /** Override the vault root (defaults to env.vaultRoot). Useful for tests. */
  vaultRoot?: string;
}

/**
 * Pure factory — builds and returns a configured Express application.
 * Does not call `.listen()`.
 */
export function createApp(options: AppOptions = {}): express.Express {
  const vaultRoot = options.vaultRoot ?? env.vaultRoot;

  const app = express();
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", createProjectsRouter({ vaultRoot }));

  return app;
}

/** Start the server when this file is the process entry point. */
function main(): void {
  const app = createApp();
  app.listen(env.backendPort, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[kuraka-control] backend on :${env.backendPort} · vault=${env.vaultRoot}`,
    );
  });
}

// Only start the server when this module is run directly (not imported by tests).
// ESM equivalent of `if (require.main === module)`.
if (process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
