import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FaultFoundCard, FaultResultView } from "../FaultFinderSheet";

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

// --- FaultResultView regression tests (unknown-result card restoration) ---
// These render the real found/unknown switch the sheet uses, not a copy.

const renderResult = (result: Parameters<typeof FaultResultView>[0]["result"]) =>
  renderToStaticMarkup(
    <FaultResultView
      result={result}
      brand="Baxi"
      model="800 Combi"
      code="ZZ9"
      isDraft={false}
      showTech={false}
      onToggleTech={() => {}}
    />,
  );

describe("FaultResultView", () => {
  it("renders the unknown card with the official manual button when a manual link exists", () => {
    const html = renderResult({ status: "unknown", manualUrl: "https://m/manual.pdf" });
    expect(html).toContain('data-testid="fault-unknown"');
    expect(html).toContain("No verified explanation available for this code yet");
    expect(html).toContain("Check this code in the official manual for the exact model.");
    expect(html).toContain("Open official Baxi manual");
  });

  it("renders the unknown card with the no-manual line when no manual link exists", () => {
    const html = renderResult({ status: "unknown", manualUrl: null });
    expect(html).toContain('data-testid="fault-unknown"');
    expect(html).toContain("No official manual link on file for this brand");
    expect(html).not.toContain("Open official");
  });

  it("renders only the found card for a known code", () => {
    const html = renderResult({ status: "found", fault });
    expect(html).toContain('data-testid="fault-found"');
    expect(html).toContain("Ignition failure — boiler will not light");
    expect(html).not.toContain('data-testid="fault-unknown"');
  });

  it("renders nothing for idle", () => {
    expect(renderResult({ status: "idle" })).toBe("");
  });
});
