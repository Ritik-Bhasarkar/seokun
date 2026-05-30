import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  setGithubToken,
  getGithubToken,
  clearGithubToken,
  _resetForTests,
} from "./gh-token-store";

afterEach(() => {
  _resetForTests();
});

describe("gh-token-store", () => {
  it("returns undefined for an unknown uid", () => {
    expect(getGithubToken("nobody")).toBeUndefined();
  });

  it("round-trips a token", () => {
    setGithubToken("octocat", "ghp_abc");
    expect(getGithubToken("octocat")).toBe("ghp_abc");
  });

  it("overwrites on a second set", () => {
    setGithubToken("octocat", "ghp_old");
    setGithubToken("octocat", "ghp_new");
    expect(getGithubToken("octocat")).toBe("ghp_new");
  });

  it("isolates uids", () => {
    setGithubToken("a", "tok_a");
    setGithubToken("b", "tok_b");
    expect(getGithubToken("a")).toBe("tok_a");
    expect(getGithubToken("b")).toBe("tok_b");
  });

  it("clearGithubToken removes only the target uid", () => {
    setGithubToken("a", "tok_a");
    setGithubToken("b", "tok_b");
    clearGithubToken("a");
    expect(getGithubToken("a")).toBeUndefined();
    expect(getGithubToken("b")).toBe("tok_b");
  });

  it("_resetForTests clears everything", () => {
    setGithubToken("a", "tok_a");
    _resetForTests();
    expect(getGithubToken("a")).toBeUndefined();
  });
});
