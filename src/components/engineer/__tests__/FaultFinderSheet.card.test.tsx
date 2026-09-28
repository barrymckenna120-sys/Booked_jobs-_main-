import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FaultFoundCard } from "../FaultFinderSheet";

const fault = {
  id: "1",
  code: "E133",
  explanation: "Ignition failure — boiler will not light",
  possible_causes: ["Gas supply", "Ignition lead"],
  technical_details: null,
  manual_title: "M",
  manual_url: "https://m/manual.pdf",
  manual_revision: null,
  manual_page: null,
  category: "fault" as const,
};

const renderCard = () =>
  renderToStaticMarkup(
    <FaultFoundCard
      fault={fault}
      brand="Baxi"
      model="800 Combi"
      isDraft={false}
      showTech={false}
      onToggleTech={() => {}}
    />,
  );

describe("FaultFoundCard result ordering", () => {
  it("renders the code heading before the explanation", () => {
    const html = renderCard();
    expect(html.indexOf("<h3")).toBeGreaterThan(-1);
    expect(html.indexOf("E133")).toBeGreaterThan(-1);
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("Ignition failure"));
  });

  it("keeps the code out of the small brand/model meta line", () => {
    const html = renderCard();
    const meta = html.indexOf("Baxi · 800 Combi");
    expect(meta).toBeGreaterThan(-1);
    expect(html.indexOf("E133")).toBeGreaterThan(meta);
  });

  it("wraps long code and explanation text", () => {
    const html = renderCard();
    expect(html).toContain('class="text-xl font-extrabold text-foreground break-words"');
    expect(html).toContain("text-base font-semibold text-foreground mt-1 break-words");
  });
});
