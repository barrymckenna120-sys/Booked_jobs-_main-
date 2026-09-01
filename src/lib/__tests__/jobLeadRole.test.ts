import { describe, it, expect } from "vitest";
import { resolveIsLeadEngineer } from "../jobLeadRole";

describe("resolveIsLeadEngineer", () => {
  it("is lead when engineer id matches assigned_engineer_id", () => {
    expect(resolveIsLeadEngineer({ engineerId: "e1", assignedEngineerId: "e1" })).toBe(true);
  });

  it("is not lead when engineer is only an assist", () => {
    expect(resolveIsLeadEngineer({ engineerId: "e2", assignedEngineerId: "e1" })).toBe(false);
  });

  it("does not gate non-engineers (office/admin)", () => {
    expect(resolveIsLeadEngineer({ engineerId: null, assignedEngineerId: "e1" })).toBe(true);
  });

  it("does not gate when the job has no lead assigned", () => {
    expect(resolveIsLeadEngineer({ engineerId: "e2", assignedEngineerId: null })).toBe(true);
  });
});
