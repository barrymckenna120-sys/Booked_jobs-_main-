import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  },
}));

import { fetchProfile, clearProfileCache } from "../profileCache";

describe("profileCache", () => {
  beforeEach(() => {
    clearProfileCache();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: { role: "office", organisation_id: "org-1" } });
  });

  it("issues one request for concurrent callers (the 7x profiles?select=role regression)", async () => {
    const results = await Promise.all([
      fetchProfile("user-1"),
      fetchProfile("user-1"),
      fetchProfile("user-1"),
    ]);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.role === "office" && r.organisation_id === "org-1")).toBe(true);
  });

  it("serves later callers from cache without refetching", async () => {
    await fetchProfile("user-1");
    await fetchProfile("user-1");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("never serves one user's profile to another user", async () => {
    await fetchProfile("user-1");
    maybeSingle.mockResolvedValue({ data: { role: "engineer", organisation_id: "org-2" } });
    const other = await fetchProfile("user-2");
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(other).toEqual({ role: "engineer", organisation_id: "org-2" });
  });

  it("returns nulls when no profile row exists", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    await expect(fetchProfile("user-9")).resolves.toEqual({ role: null, organisation_id: null });
  });
});
