import { describe, it, expect } from "vitest";
import { env } from "../src/config/env.js";

describe("env", () => {
  it("resolves an absolute vault root", () => {
    expect(env.vaultRoot.startsWith("/")).toBe(true);
  });

  it("defaults the backend port to a number", () => {
    expect(typeof env.backendPort).toBe("number");
  });
});
