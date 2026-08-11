import { describe, it, expect, vi, beforeEach } from "vitest";

const captured: { patch: any; id: string | null } = { patch: null, id: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "auth-uid-1" } } }) },
    from: () => ({
      update: (patch: any) => ({
        eq: (_col: string, id: string) => {
          captured.patch = patch;
          captured.id = id;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

const { updatePartStatus } = await import("./partsRequests");

describe("updatePartStatus", () => {
  beforeEach(() => {
    captured.patch = null;
    captured.id = null;
  });

  it("stamps cancelled_by and cancelled_at when cancelling", async () => {
    await updatePartStatus("row-1", "Cancelled");
    expect(captured.id).toBe("row-1");
    expect(captured.patch.status).toBe("Cancelled");
    expect(captured.patch.cancelled_by).toBe("auth-uid-1");
    expect(typeof captured.patch.cancelled_at).toBe("string");
  });

  it("never sets cancelled_by on the other statuses", async () => {
    for (const status of ["Open", "Ordered", "Ready to Fit"] as const) {
      captured.patch = null;
      await updatePartStatus("row-1", status);
      expect(captured.patch.cancelled_by).toBeUndefined();
      expect(captured.patch.cancelled_at).toBeUndefined();
    }
  });

  it("stamps the matching timestamp for Ordered and Ready to Fit", async () => {
    await updatePartStatus("row-1", "Ordered");
    expect(typeof captured.patch.ordered_at).toBe("string");
    await updatePartStatus("row-1", "Ready to Fit");
    expect(typeof captured.patch.ready_at).toBe("string");
  });
});
