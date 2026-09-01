import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrimaryActions from "../PrimaryActions";

const render = (props: any) =>
  renderToStaticMarkup(
    <PrimaryActions
      status="In Progress"
      onStatusChange={() => {}}
      onComplete={() => {}}
      onCancel={() => {}}
      onNoShow={() => {}}
      onPartsNeeded={() => {}}
      {...props}
    />
  );

describe("PrimaryActions lead/assist gating", () => {
  it("shows Complete and the can't-complete link for the Lead", () => {
    const html = render({ isLeadEngineer: true });
    expect(html).toContain("Complete");
    expect(html).toContain("complete this job?");
    expect(html).not.toContain("Assisting");
  });

  it("shows only a static Assisting row for an Assist", () => {
    const html = render({ isLeadEngineer: false, leadName: "Test Engineer" });
    expect(html).toContain("Assisting Test Engineer");
    expect(html).not.toContain("complete this job?");
    expect(html).not.toContain("<button");
  });

  it("hides En Route for an Assist on a Booked job", () => {
    const html = render({ isLeadEngineer: false, leadName: "Karl", status: "Booked" });
    expect(html).not.toContain("En Route");
    expect(html).toContain("Assisting Karl");
  });
});
