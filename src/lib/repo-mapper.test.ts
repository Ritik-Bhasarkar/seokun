import { describe, expect, it } from "vitest";
import { toRepoListItem, formatRelative } from "./repo-mapper";

describe("toRepoListItem", () => {
  it("maps a GitHub repo to RepoListItem", () => {
    const result = toRepoListItem({
      name: "lume-app",
      owner: { login: "acme" },
      language: "TypeScript",
      pushed_at: "2026-05-27T10:00:00Z",
      private: true,
    });
    expect(result).toEqual({
      owner: "acme",
      name: "lume-app",
      lang: "TypeScript",
      pushedAt: expect.any(String),
      private: true,
    });
  });

  it("uses empty string when language is null", () => {
    const result = toRepoListItem({
      name: "x",
      owner: { login: "y" },
      language: null,
      pushed_at: "2026-05-27T10:00:00Z",
      private: false,
    });
    expect(result.lang).toBe("");
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for <1 minute", () => {
    const now = Date.parse("2026-05-27T10:00:30Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("just now");
  });

  it("returns minutes ago for <1 hour", () => {
    const now = Date.parse("2026-05-27T10:05:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("5m ago");
  });

  it("returns hours ago for <1 day", () => {
    const now = Date.parse("2026-05-27T13:00:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("3h ago");
  });

  it("returns days ago otherwise", () => {
    const now = Date.parse("2026-05-30T10:00:00Z");
    expect(formatRelative("2026-05-27T10:00:00Z", now)).toBe("3d ago");
  });
});
