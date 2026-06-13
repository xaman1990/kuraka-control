import { describe, it, expect } from "vitest";
import { Governance } from "@kuraka-control/contracts";

describe("contracts wiring", () => {
  it("exposes the two-color governance enum", () => {
    expect(Governance.options).toEqual(["framework", "project"]);
  });
});
