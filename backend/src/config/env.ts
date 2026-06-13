/** Environment + path roots. The vault is the source of truth (C2). */
import path from "node:path";

const DEFAULT_VAULT = "/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka";

export const env = {
  vaultRoot: path.resolve(process.env.KURAKA_VAULT ?? DEFAULT_VAULT),
  backendPort: Number(process.env.BACKEND_PORT ?? 5174),
} as const;
