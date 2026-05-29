import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { clearSession } = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ clearSession }));

import { POST } from "./route";

describe("POST /api/auth/github/logout", () => {
  it("clears the session and returns 204", async () => {
    const res = await POST();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(res.status).toBe(204);
  });
});
