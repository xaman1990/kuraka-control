/**
 * Unit tests for curateProjectConfig (domain layer — S3).
 *
 * Pure function — no mocks, no fs, no env. Covers the FROZEN curation mapping
 * from SCHEMA-FROZEN-S3.md §2, the type-strict rule (no coercion), the
 * architecture_layers filter, partial/waCert shapes, empty sections, and
 * unknown-key tolerance.
 *
 * Test vectors (T1 — all from SCHEMA-FROZEN-S3.md §5):
 *   1. Full config → all 10 fields populated correctly (exact yaml→field mapping).
 *   2. Type-strict: string in number slot → null; number in string slot → null.
 *   3. architecture_layers filter: mixed array → strings only; non-array → [];
 *      absent → []; never null.
 *   4. Partial / waCert shapes: missing stack.frontend → frontend fields null;
 *      stack.language (not nested) → backend_language null.
 *   5. Empty / missing sections → per-field null, layers []; never throws.
 *   6. Unknown extra keys ignored: extra top-level keys don't appear, don't crash.
 */
import { describe, it, expect } from "vitest";
import { curateProjectConfig } from "./projectConfig.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a kuraka-control-shaped raw config object. Mirrors the live values
 *  documented in SCHEMA-FROZEN-S3.md §2 "Live-validated against kuraka.config.yaml". */
function _makeFullRaw() {
  return {
    stack: {
      backend: {
        language: "typescript",
        framework: "express",
      },
      frontend: {
        language: "typescript",
        framework: "react",
        state_mgmt: "zustand",
      },
    },
    architecture: {
      layers: ["domain", "repository", "service", "route"],
    },
    conventions: {
      naming_language: "english",
      max_file_loc: 400,
      max_function_loc: 50,
    },
    workflow: {
      default_mode: "normal",
    },
  };
}

// ---------------------------------------------------------------------------
// T1-1: Full config → all 10 fields populated with correct yaml→field mapping
// ---------------------------------------------------------------------------

describe("curateProjectConfig — full config produces all 10 fields (FROZEN mapping)", () => {
  it("should map stack.backend.language to backend_language", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.backend_language).toBe("typescript");
  });

  it("should map stack.backend.framework to backend_framework", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.backend_framework).toBe("express");
  });

  it("should map stack.frontend.language to frontend_language", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.frontend_language).toBe("typescript");
  });

  it("should map stack.frontend.framework to frontend_framework", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.frontend_framework).toBe("react");
  });

  it("should map stack.frontend.state_mgmt to state_mgmt", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.state_mgmt).toBe("zustand");
  });

  it("should map architecture.layers to architecture_layers as a string array", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual(["domain", "repository", "service", "route"]);
  });

  it("should map conventions.naming_language to naming_language", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.naming_language).toBe("english");
  });

  it("should map conventions.max_file_loc to max_file_loc as a number", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_file_loc).toBe(400);
  });

  it("should map conventions.max_function_loc to max_function_loc as a number", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_function_loc).toBe(50);
  });

  it("should map workflow.default_mode to default_mode", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.default_mode).toBe("normal");
  });

  it("should produce a result with exactly the 10 canonical fields (no extra keys)", () => {
    // Arrange
    const raw = _makeFullRaw();

    // Act
    const result = curateProjectConfig(raw);

    // Assert — all 10 fields present and none undefined
    const keys = Object.keys(result);
    expect(keys).toHaveLength(10);
    expect(result.backend_language).not.toBeUndefined();
    expect(result.backend_framework).not.toBeUndefined();
    expect(result.frontend_language).not.toBeUndefined();
    expect(result.frontend_framework).not.toBeUndefined();
    expect(result.architecture_layers).not.toBeUndefined();
    expect(result.state_mgmt).not.toBeUndefined();
    expect(result.naming_language).not.toBeUndefined();
    expect(result.max_file_loc).not.toBeUndefined();
    expect(result.max_function_loc).not.toBeUndefined();
    expect(result.default_mode).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T1-2: Type-strict — no coercion (FROZEN rule: string in number slot → null)
// ---------------------------------------------------------------------------

describe("curateProjectConfig — type-strict: string in number slot → null (no coercion)", () => {
  it("should return null for max_file_loc when the yaml value is a string '400' (not a number)", () => {
    // Arrange — SCHEMA-FROZEN-S3.md §2: "do NOT coerce strings → number" (AC-B4)
    const raw = {
      conventions: { max_file_loc: "400", max_function_loc: 50 },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_file_loc).toBeNull();
  });

  it("should return null for max_function_loc when the yaml value is a string '50'", () => {
    // Arrange
    const raw = {
      conventions: { max_file_loc: 400, max_function_loc: "50" },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_function_loc).toBeNull();
  });

  it("should return null for max_file_loc when the value is a boolean true", () => {
    // Arrange
    const raw = {
      conventions: { max_file_loc: true, max_function_loc: 50 },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_file_loc).toBeNull();
  });

  it("should return null for backend_language when the yaml value is a number (number in string slot)", () => {
    // Arrange — number where a string vocabulary is expected
    const raw = {
      stack: {
        backend: { language: 42, framework: "express" },
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.backend_language).toBeNull();
  });

  it("should return null for naming_language when the yaml value is a boolean", () => {
    // Arrange
    const raw = {
      conventions: { naming_language: true },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.naming_language).toBeNull();
  });

  it("should return null for default_mode when the yaml value is an object", () => {
    // Arrange
    const raw = {
      workflow: { default_mode: { nested: "object" } },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.default_mode).toBeNull();
  });

  it("should keep valid number fields when they are actual numbers (not string-coerced)", () => {
    // Arrange — confirm correct types still pass through
    const raw = {
      conventions: { max_file_loc: 400, max_function_loc: 50 },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.max_file_loc).toBe(400);
    expect(result.max_function_loc).toBe(50);
    expect(typeof result.max_file_loc).toBe("number");
    expect(typeof result.max_function_loc).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// T1-3: architecture_layers filter
// ---------------------------------------------------------------------------

describe("curateProjectConfig — architecture_layers: only string members kept", () => {
  it("should keep only string members and drop numbers and null from a mixed array", () => {
    // Arrange
    const raw = {
      architecture: { layers: ["route", 42, null] },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — only "route" survives; 42 and null are dropped
    expect(result.architecture_layers).toEqual(["route"]);
  });

  it("should return an empty array when architecture.layers is not an array", () => {
    // Arrange
    const raw = {
      architecture: { layers: "not-an-array" },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual([]);
  });

  it("should return an empty array when architecture.layers is an object", () => {
    // Arrange
    const raw = {
      architecture: { layers: { domain: true } },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual([]);
  });

  it("should return an empty array when architecture section is absent", () => {
    // Arrange — no architecture key at all
    const raw = { stack: { backend: { language: "typescript" } } };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — never null, always []
    expect(result.architecture_layers).toEqual([]);
  });

  it("should return an empty array when architecture.layers is null", () => {
    // Arrange
    const raw = { architecture: { layers: null } };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual([]);
  });

  it("should never return null for architecture_layers in any input shape", () => {
    // Arrange — completely empty input
    const raw = {};

    // Act
    const result = curateProjectConfig(raw);

    // Assert — FROZEN: architecture_layers is NEVER null
    expect(result.architecture_layers).not.toBeNull();
    expect(Array.isArray(result.architecture_layers)).toBe(true);
  });

  it("should drop boolean false members from the layers array", () => {
    // Arrange
    const raw = {
      architecture: { layers: ["domain", false, "service", undefined] },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual(["domain", "service"]);
  });
});

// ---------------------------------------------------------------------------
// T1-4: Partial and waCert shapes
// ---------------------------------------------------------------------------

describe("curateProjectConfig — partial shape: missing stack.frontend → frontend fields null", () => {
  it("should set frontend_language to null when stack.frontend is absent", () => {
    // Arrange — only backend present under stack
    const raw = {
      stack: {
        backend: { language: "typescript", framework: "express" },
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.frontend_language).toBeNull();
  });

  it("should set frontend_framework to null when stack.frontend is absent", () => {
    // Arrange
    const raw = {
      stack: {
        backend: { language: "typescript", framework: "express" },
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.frontend_framework).toBeNull();
  });

  it("should set state_mgmt to null when stack.frontend is absent", () => {
    // Arrange
    const raw = {
      stack: {
        backend: { language: "typescript", framework: "express" },
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.state_mgmt).toBeNull();
  });

  it("should preserve populated backend fields when stack.frontend is absent", () => {
    // Arrange
    const raw = {
      stack: {
        backend: { language: "typescript", framework: "express" },
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — backend fields still populated
    expect(result.backend_language).toBe("typescript");
    expect(result.backend_framework).toBe("express");
  });
});

describe("curateProjectConfig — waCert shape: top-level stack.language → backend_language null", () => {
  it("should return null for backend_language when language is a top-level stack sibling (not nested under backend)", () => {
    // Arrange — waCert shape: `stack.language` instead of `stack.backend.language`
    // FROZEN: reads ONLY `stack.backend.language`; top-level siblings are ignored by design
    const raw = {
      stack: {
        language: "python",  // at stack level, NOT under stack.backend
        runtime: "3.11",
      },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — no crash, no special case; just null for the nested path
    expect(result.backend_language).toBeNull();
  });

  it("should not throw when given a waCert top-level stack.language shape", () => {
    // Arrange
    const raw = {
      stack: {
        language: "python",
        runtime: "3.11",
      },
    };

    // Act / Assert
    expect(() => curateProjectConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T1-5: Empty / missing sections → per-field null, layers []; never throws
// ---------------------------------------------------------------------------

describe("curateProjectConfig — empty input → all fields null, layers []", () => {
  it("should return all string/number fields as null for an empty input object", () => {
    // Arrange
    const raw = {};

    // Act
    const result = curateProjectConfig(raw);

    // Assert — every nullable field is null
    expect(result.backend_language).toBeNull();
    expect(result.backend_framework).toBeNull();
    expect(result.frontend_language).toBeNull();
    expect(result.frontend_framework).toBeNull();
    expect(result.state_mgmt).toBeNull();
    expect(result.naming_language).toBeNull();
    expect(result.max_file_loc).toBeNull();
    expect(result.max_function_loc).toBeNull();
    expect(result.default_mode).toBeNull();
  });

  it("should return architecture_layers as [] for an empty input object (never null)", () => {
    // Arrange
    const raw = {};

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual([]);
  });

  it("should not throw for an empty input object", () => {
    // Arrange / Act / Assert
    expect(() => curateProjectConfig({})).not.toThrow();
  });
});

describe("curateProjectConfig — empty stack: section → all stack fields null", () => {
  it("should return all stack fields null when stack is an empty object", () => {
    // Arrange — `stack:` exists but has no sub-keys
    const raw = { stack: {} };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.backend_language).toBeNull();
    expect(result.backend_framework).toBeNull();
    expect(result.frontend_language).toBeNull();
    expect(result.frontend_framework).toBeNull();
    expect(result.state_mgmt).toBeNull();
  });

  it("should still return layers [] when stack is empty and architecture is absent", () => {
    // Arrange
    const raw = { stack: {} };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.architecture_layers).toEqual([]);
  });

  it("should not throw when stack is an empty object", () => {
    // Arrange / Act / Assert
    expect(() => curateProjectConfig({ stack: {} })).not.toThrow();
  });
});

describe("curateProjectConfig — stack section is an array (degenerate YAML) → all stack fields null", () => {
  it("should return null for all stack fields when stack is an array (not an object)", () => {
    // Arrange
    const raw = { stack: ["backend", "frontend"] };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect(result.backend_language).toBeNull();
    expect(result.backend_framework).toBeNull();
    expect(result.frontend_language).toBeNull();
    expect(result.frontend_framework).toBeNull();
  });

  it("should not throw when stack is an array", () => {
    // Arrange / Act / Assert
    expect(() => curateProjectConfig({ stack: ["backend", "frontend"] })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T1-6: Unknown extra keys ignored
// ---------------------------------------------------------------------------

describe("curateProjectConfig — unknown extra keys ignored (no crash, no leakage)", () => {
  it("should not include auth key in the result when raw has an auth section", () => {
    // Arrange
    const raw = {
      ..._makeFullRaw(),
      auth: { provider: "jwt", secret: "s3cr3t" },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — auth must not appear in the output
    expect((result as Record<string, unknown>)["auth"]).toBeUndefined();
  });

  it("should not include database key in the result when raw has a database section", () => {
    // Arrange
    const raw = {
      ..._makeFullRaw(),
      database: { host: "localhost", port: 5432 },
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect((result as Record<string, unknown>)["database"]).toBeUndefined();
  });

  it("should not include confidence key in the result when raw has a confidence field", () => {
    // Arrange
    const raw = {
      ..._makeFullRaw(),
      confidence: 0.95,
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert
    expect((result as Record<string, unknown>)["confidence"]).toBeUndefined();
  });

  it("should not crash and should produce correct values when raw has many unknown extra keys", () => {
    // Arrange
    const raw = {
      ..._makeFullRaw(),
      auth: { provider: "jwt" },
      database: { host: "localhost" },
      confidence: 0.95,
      identifier_style: "snake_case",
      country_dimension: "co",
    };

    // Act
    const result = curateProjectConfig(raw);

    // Assert — the 10 curated fields are still correct; extras absent
    expect(result.backend_language).toBe("typescript");
    expect(result.default_mode).toBe("normal");
    expect(Object.keys(result)).toHaveLength(10);
  });
});
