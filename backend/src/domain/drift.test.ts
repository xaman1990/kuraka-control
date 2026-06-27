/**
 * Unit tests for compareVersions and computeDrift (domain layer).
 *
 * AC-35: covers all 6 rows of the FROZEN decision table (SCHEMA-FROZEN-S2.md §2)
 * and the FROZEN version-compare rule (§3), including the required test vector
 * compareVersions("0.3.10","0.3.9") === 1.
 *
 * Pure functions — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { compareVersions, computeDrift } from "./drift.js";

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

describe("compareVersions — FROZEN test vector (segment-wise numeric, not lexicographic)", () => {
  it("should return 1 when a=0.3.10 and b=0.3.9 (string compare would yield -1)", () => {
    // Arrange / Act
    const result = compareVersions("0.3.10", "0.3.9");

    // Assert — the FROZEN required vector
    expect(result).toBe(1);
  });
});

describe("compareVersions — equal versions", () => {
  it("should return 0 when both versions are identical", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.3.4", "0.3.4")).toBe(0);
  });

  it("should return 0 when major versions are both 0 and minor/patch are equal", () => {
    // Arrange / Act / Assert
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });
});

describe("compareVersions — a < b (returns -1)", () => {
  it("should return -1 when lock patch is less than vault patch (0.3.2 vs 0.3.4)", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.3.2", "0.3.4")).toBe(-1);
  });

  it("should return -1 when lock minor is less than vault minor", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.2.0", "0.3.0")).toBe(-1);
  });

  it("should return -1 when lock major is less than vault major", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.4.0", "1.0.0")).toBe(-1);
  });
});

describe("compareVersions — a > b (returns 1)", () => {
  it("should return 1 when lock is ahead (0.4.0 vs 0.3.4)", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.4.0", "0.3.4")).toBe(1);
  });

  it("should return 1 when lock major is greater", () => {
    // Arrange / Act / Assert
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });
});

describe("compareVersions — non-semver inputs (returns null, never throws)", () => {
  it("should return null for a two-segment version string like '0.3'", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.3", "0.3.4")).toBeNull();
  });

  it("should return null for a version with 'v' prefix like 'v0.3.4'", () => {
    // Arrange / Act / Assert
    expect(compareVersions("v0.3.4", "0.3.4")).toBeNull();
  });

  it("should return null for the literal string 'latest'", () => {
    // Arrange / Act / Assert
    expect(compareVersions("latest", "0.3.4")).toBeNull();
  });

  it("should return null for an empty string", () => {
    // Arrange / Act / Assert
    expect(compareVersions("", "0.3.4")).toBeNull();
  });

  it("should return null for a pre-release string like '0.3.4-rc1'", () => {
    // Arrange / Act / Assert
    expect(compareVersions("0.3.4-rc1", "0.3.4")).toBeNull();
  });

  it("should not throw when given non-semver inputs", () => {
    // Arrange / Act / Assert
    expect(() => compareVersions("latest", "garbage")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeDrift — decision table rows (top-down, first match wins)
// ---------------------------------------------------------------------------

describe("computeDrift — row 1: lockVersion null → not_pinned (short-circuit)", () => {
  it("should return not_pinned when lockVersion is null, vaultVersion is valid", () => {
    // Arrange / Act / Assert
    expect(computeDrift(null, "0.3.4")).toBe("not_pinned");
  });

  it("should return not_pinned when both lockVersion and vaultVersion are null (row 1 short-circuits row 2)", () => {
    // Arrange / Act / Assert
    expect(computeDrift(null, null)).toBe("not_pinned");
  });

  it("should return not_pinned when lockVersion is null regardless of vault version validity", () => {
    // Arrange / Act / Assert
    expect(computeDrift(null, "latest")).toBe("not_pinned");
  });
});

describe("computeDrift — row 2: lockVersion present, vaultVersion null → unknown", () => {
  it("should return unknown when lockVersion is present and vaultVersion is null", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.3.4", null)).toBe("unknown");
  });
});

describe("computeDrift — row 3: either version non-semver → unknown", () => {
  it("should return unknown when lockVersion is non-semver ('latest') and vault is valid", () => {
    // Arrange / Act / Assert
    expect(computeDrift("latest", "0.3.4")).toBe("unknown");
  });

  it("should return unknown when vaultVersion is non-semver and lock is valid", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.3.4", "latest")).toBe("unknown");
  });

  it("should return unknown when both versions present but neither is semver", () => {
    // Arrange / Act / Assert
    expect(computeDrift("v0.3.4", "v0.3.4")).toBe("unknown");
  });

  it("should not throw when a version is non-semver (routes to unknown, never throws)", () => {
    // Arrange / Act / Assert
    expect(() => computeDrift("not-a-version", "0.3.4")).not.toThrow();
  });
});

describe("computeDrift — row 4: both semver, equal → up_to_date", () => {
  it("should return up_to_date when lock and vault are the same version", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.3.4", "0.3.4")).toBe("up_to_date");
  });
});

describe("computeDrift — row 5: lock < vault → behind", () => {
  it("should return behind when lock patch is less than vault patch (0.3.2 vs 0.3.4)", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.3.2", "0.3.4")).toBe("behind");
  });

  it("should return behind when lock minor is less than vault minor", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.2.9", "0.3.0")).toBe("behind");
  });
});

describe("computeDrift — row 6: lock > vault → ahead", () => {
  it("should return ahead when lock is ahead of vault (0.4.0 vs 0.3.4)", () => {
    // Arrange / Act / Assert
    expect(computeDrift("0.4.0", "0.3.4")).toBe("ahead");
  });

  it("should return ahead when lock patch is greater via numeric compare (0.3.10 vs 0.3.9)", () => {
    // Arrange / Act / Assert — FROZEN test vector applied at computeDrift level too
    expect(computeDrift("0.3.10", "0.3.9")).toBe("ahead");
  });
});
