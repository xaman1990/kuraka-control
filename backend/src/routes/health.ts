/** Health route — confirms the skeleton boots and sees the vault. */
import { Router } from "express";
import fs from "node:fs";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const vaultReadable = fs.existsSync(env.vaultRoot);
  res.json({
    ok: true,
    service: "kuraka-control",
    vaultRoot: env.vaultRoot,
    vaultReadable,
  });
});
