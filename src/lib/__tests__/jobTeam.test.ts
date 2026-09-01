import { describe, it, expect } from "vitest";
import { groupJobAssists, buildJobTeamLines } from "../jobTeam";

describe("groupJobAssists", () => {
  it("groups rows by job and drops nameless/duplicate rows", () => {
    const map = groupJobAssists([
      { job_id: "j1", engineer_id: "e1", engineers: { name: "Karl" } },
      { job_id: "j1", engineer_id: "e2", engineers: { name: "nicole" } },
      { job_id: "j1", engineer_id: "e1", engineers: { name: "Karl" } },
      { job_id: "j2", engineer_id: "e3", engineers: { name: null } },
    ]);
    expect(map.j1.map((a) => a.name)).toEqual(["Karl", "nicole"]);
    expect(map.j2).toBeUndefined();
  });

  it("handles empty input", () => {
    expect(groupJobAssists(null)).toEqual({});
  });
});

describe("buildJobTeamLines", () => {
  it("returns a single unlabelled-lead line when there are no assists", () => {
    expect(buildJobTeamLines("Barry", [])).toEqual([{ key: "lead", name: "Barry", role: "Lead" }]);
  });

  it("returns lead + assistants in order", () => {
    expect(
      buildJobTeamLines("Barry", [
        { id: "e1", name: "Karl" },
        { id: "e2", name: "nicole" },
      ])
    ).toEqual([
      { key: "lead", name: "Barry", role: "Lead" },
      { key: "e1", name: "Karl", role: "Assistant" },
      { key: "e2", name: "nicole", role: "Assistant" },
    ]);
  });

  it("returns no lines when nobody is assigned", () => {
    expect(buildJobTeamLines(null, undefined)).toEqual([]);
  });

  it("still lists assists when the lead name is missing", () => {
    expect(buildJobTeamLines("  ", [{ id: "e1", name: "Karl" }])).toEqual([
      { key: "e1", name: "Karl", role: "Assistant" },
    ]);
  });
});
