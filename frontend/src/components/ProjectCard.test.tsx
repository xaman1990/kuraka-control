import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProjectCard } from "./ProjectCard.js";

/**
 * ProjectCard unit tests (AC-32).
 * Covers: known status badge variant, unknown status fallback, link to /projects/:name.
 */

afterEach(() => {
  cleanup();
});

function renderCard(props: Partial<React.ComponentProps<typeof ProjectCard>> = {}) {
  const defaults: React.ComponentProps<typeof ProjectCard> = {
    name: "test-project",
    stack: "React + FastAPI",
    status: "active",
    governance: "project",
    kuraka_version: null,
    ...props,
  };
  return render(
    <MemoryRouter>
      <ProjectCard {...defaults} />
    </MemoryRouter>,
  );
}

describe("ProjectCard", () => {
  it("renders with known status 'active' and displays the jade badge text", () => {
    renderCard({ status: "active" });

    const badge = screen.getByText("active");
    expect(badge).toBeTruthy();
  });

  it("renders with unknown status and displays the literal string", () => {
    renderCard({ status: "experimental" });

    const badge = screen.getByText("experimental");
    expect(badge).toBeTruthy();
  });

  it("renders a link pointing to /projects/:name", () => {
    renderCard({ name: "my-project" });

    const link = screen.getByRole("link");
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe(
      "/projects/my-project",
    );
  });

  it("renders the project name as heading text", () => {
    renderCard({ name: "sie-v2" });

    expect(screen.getByText("sie-v2")).toBeTruthy();
  });

  it("renders kuraka_version when provided", () => {
    renderCard({ kuraka_version: "0.9.2" });

    expect(screen.getByText("v0.9.2")).toBeTruthy();
  });

  it("does not render a version span when kuraka_version is null", () => {
    renderCard({ kuraka_version: null });

    expect(screen.queryByText(/^v\d/)).toBeNull();
  });

  it("renders each known status without error", () => {
    const statuses = ["active", "paused", "onboarding", "archived", "mapped"];
    for (const status of statuses) {
      renderCard({ status });
      expect(screen.getByText(status)).toBeTruthy();
      cleanup();
    }
  });
});
