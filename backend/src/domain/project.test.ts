/**
 * Unit tests for parseProjectFrontmatter (domain layer).
 *
 * AC-29: happy path, "" → null normalization, missing name → null,
 * malformed/garbage input → null (never throws), tags absent → [].
 *
 * Pure function — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { parseProjectFrontmatter } from "./project.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fully valid frontmatter data object (as gray-matter would return). */
function _makeValidFrontmatter(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "sie_v2",
    path: "/Users/xmn/Desarrollos/sie_v2",
    stack: "python-fastapi / vue-pinia",
    kuraka_version: "0.3.4",
    has_project_layer: true,
    default_mode: "normal",
    status: "active",
    repo_url: "https://github.com/org/sie_v2",
    focus_scope: "backend",
    last_mount: "2026-06-01",
    last_sync: "2026-06-10",
    tags: ["backend", "frontend"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("parseProjectFrontmatter — happy path", () => {
  it("should return a ProjectSummary when given a fully valid frontmatter object", () => {
    // Arrange
    const raw = _makeValidFrontmatter();

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.name).toBe("sie_v2");
    expect(result?.path).toBe("/Users/xmn/Desarrollos/sie_v2");
    expect(result?.stack).toBe("python-fastapi / vue-pinia");
    expect(result?.has_project_layer).toBe(true);
    expect(result?.default_mode).toBe("normal");
    expect(result?.status).toBe("active");
    expect(result?.tags).toEqual(["backend", "frontend"]);
  });

  it("should force governance to 'project' regardless of what raw contains", () => {
    // Arrange — even if frontmatter had a governance key (it shouldn't), domain ignores it
    const raw = _makeValidFrontmatter({ governance: "framework" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.governance).toBe("project");
  });

  it("should coerce a numeric kuraka_version (e.g. 0.3) to a string", () => {
    // Arrange — YAML parses bare 0.3 as number
    const raw = _makeValidFrontmatter({ kuraka_version: 0.3 });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.kuraka_version).toBe("0.3");
    expect(typeof result?.kuraka_version).toBe("string");
  });

  it("should coerce an integer kuraka_version (e.g. 1) to a string", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ kuraka_version: 1 });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.kuraka_version).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// "" → null normalization
// ---------------------------------------------------------------------------

describe("parseProjectFrontmatter — empty string normalization", () => {
  it("should normalize empty string repo_url to null", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ repo_url: "" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.repo_url).toBeNull();
  });

  it("should normalize empty string focus_scope to null", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ focus_scope: "" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.focus_scope).toBeNull();
  });

  it("should normalize empty string last_mount to null", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ last_mount: "" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.last_mount).toBeNull();
  });

  it("should normalize empty string last_sync to null", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ last_sync: "" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.last_sync).toBeNull();
  });

  it("should pass through a non-empty repo_url unchanged", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ repo_url: "https://github.com/org/repo" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.repo_url).toBe("https://github.com/org/repo");
  });

  it("should keep null repo_url as null when frontmatter has explicit null", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ repo_url: null });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.repo_url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tags absent → []
// ---------------------------------------------------------------------------

describe("parseProjectFrontmatter — tags normalization", () => {
  it("should return empty array for tags when the field is absent", () => {
    // Arrange
    const raw = _makeValidFrontmatter();
    delete (raw as Record<string, unknown>)["tags"];

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.tags).toEqual([]);
  });

  it("should return empty array for tags when the field is undefined", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ tags: undefined });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.tags).toEqual([]);
  });

  it("should preserve a non-empty tags array", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ tags: ["infra", "ml"] });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result?.tags).toEqual(["infra", "ml"]);
  });
});

// ---------------------------------------------------------------------------
// Missing required fields → null
// ---------------------------------------------------------------------------

describe("parseProjectFrontmatter — missing required fields", () => {
  it("should return null when name key is absent", () => {
    // Arrange
    const raw = _makeValidFrontmatter();
    delete (raw as Record<string, unknown>)["name"];

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when name is an empty string", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ name: "" });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when name is whitespace-only", () => {
    // Arrange
    const raw = _makeValidFrontmatter({ name: "   " });

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("should return null when required path field is missing", () => {
    // Arrange
    const raw = _makeValidFrontmatter();
    delete (raw as Record<string, unknown>)["path"];

    // Act
    const result = parseProjectFrontmatter(raw);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Malformed / garbage input → null, never throws
// ---------------------------------------------------------------------------

describe("parseProjectFrontmatter — malformed input degrades gracefully", () => {
  it("should return null and not throw when given null", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter(null)).not.toThrow();
    expect(parseProjectFrontmatter(null)).toBeNull();
  });

  it("should return null and not throw when given a plain string", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter("not-an-object")).not.toThrow();
    expect(parseProjectFrontmatter("not-an-object")).toBeNull();
  });

  it("should return null and not throw when given a number", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter(42)).not.toThrow();
    expect(parseProjectFrontmatter(42)).toBeNull();
  });

  it("should return null and not throw when given an array", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter(["foo", "bar"])).not.toThrow();
    expect(parseProjectFrontmatter(["foo", "bar"])).toBeNull();
  });

  it("should return null and not throw when given undefined", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter(undefined)).not.toThrow();
    expect(parseProjectFrontmatter(undefined)).toBeNull();
  });

  it("should return null and not throw when given an empty object", () => {
    // Arrange / Act / Assert
    expect(() => parseProjectFrontmatter({})).not.toThrow();
    expect(parseProjectFrontmatter({})).toBeNull();
  });

  it("should return null and not throw when zod validation fails on wrong field types", () => {
    // Arrange — name present but has_project_layer is a string (type error)
    const raw = _makeValidFrontmatter({ has_project_layer: "yes" });

    // Act / Assert
    expect(() => parseProjectFrontmatter(raw)).not.toThrow();
    expect(parseProjectFrontmatter(raw)).toBeNull();
  });
});
