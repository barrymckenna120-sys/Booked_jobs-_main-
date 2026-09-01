import { describe, it, expect, vi, beforeEach } from "vitest";

let response: any = { data: [{ id: "job-1" }], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => ({ select: async () => response }) }),
    }),
  },
}));

import { updateServiceCallRow } from "@/lib/serviceCallWrite";

describe("updateServiceCallRow", () => {
  beforeEach(() => {
    response = { data: [{ id: "job-1" }], error: null };
  });

  it("reports success when the intended row was changed", async () => {
    const res = await updateServiceCallRow("job-1", { status: "In Progress" });
    expect(res).toEqual({ error: null, blocked: false });
  });

  it("reports blocked when zero rows were changed", async () => {
    response = { data: [], error: null };
    const res = await updateServiceCallRow("job-1", { status: "In Progress" });
    expect(res.blocked).toBe(true);
    expect(res.error).toBeNull();
  });

  it("reports blocked when no data is returned at all", async () => {
    response = { data: null, error: null };
    expect((await updateServiceCallRow("job-1", {})).blocked).toBe(true);
  });

  it("reports a transport error as an error, not as blocked", async () => {
    response = { data: null, error: { message: "network" } };
    const res = await updateServiceCallRow("job-1", {});
    expect(res.blocked).toBe(false);
    expect(res.error).toEqual({ message: "network" });
  });
});
