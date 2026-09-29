import { describe, it, expect, vi, beforeEach } from "vitest";
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

// --- Full-sheet regression tests (unknown-result card restoration) ---

const h = vi.hoisted(() => ({
  state: { code: "", submitted: false, emptyCodes: false },
  codes: [
    {
      id: "1", code: "E133", explanation: "Ignition failure — boiler will not light",
      possible_causes: ["Gas supply"], technical_details: null,
      manual_title: "M", manual_url: "https://m/manual.pdf", manual_revision: null,
      manual_page: null, category: "fault", status: "published",
    },
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0];
    if (key === "fault-finder-brands") {
      return { data: new Map([["Baxi", ["600 Combi", "800 Combi"]]]), isLoading: false, isError: false, refetch: () => {} };
    }
    if (key === "fault-library-models") {
      return { data: [{ id: "m1", brand: "Baxi", model_name: "800 Combi" }], isError: false, refetch: () => {} };
    }
    if (key === "fault-library-codes") {
      return { data: h.state.emptyCodes ? [] : h.codes, isFetching: false, isError: false, refetch: () => {} };
    }
    return { data: undefined, isError: false, refetch: () => {} };
  },
}));

// The code field cannot receive input without a DOM, so the mock injects only
// the scenario `code`/`submitted`; brand, library codes and all matching logic
// stay real (faultFinder.test.ts covers the matcher itself).
vi.mock("@/lib/faultFinder", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const real = actual.resolveFaultResult as (...args: unknown[]) => unknown;
  return {
    ...actual,
    resolveFaultResult: (libCodes: unknown, _code: string, brand: string, _submitted: boolean) =>
      real(libCodes, h.state.code, brand, h.state.submitted),
  };
});

const FaultFinderSheet = vi.mocked((await import("../FaultFinderSheet")).default);

const renderSheet = (brand: string, model = "") =>
  renderToStaticMarkup(<FaultFinderSheet prefill={{ brand, model }} onClose={() => {}} />);

describe("FaultFinderSheet unknown-result card (restored in regression)", () => {
  beforeEach(() => {
    h.state.code = "";
    h.state.submitted = false;
    h.state.emptyCodes = false;
  });

  it("shows the unknown card with the official manual button for a brand with a manual link", () => {
    h.state.code = "ZZ9";
    h.state.submitted = true;
    const html = renderSheet("Baxi", "800 Combi");
    expect(html).toContain('data-testid="fault-unknown"');
    // The heading's code portion comes from the component's own input state,
    // which static render cannot fill; the brand portion is asserted instead.
    expect(html).toContain("Baxi · ");
    expect(html).toContain("No verified explanation available for this code yet");
    expect(html).toContain("Check this code in the official manual for the exact model.");
    expect(html).toContain("Open official Baxi manual");
  });

  it("shows the unknown card with the no-manual line for a brand without a manual link", () => {
    h.state.emptyCodes = true;
    h.state.code = "ZZ9";
    h.state.submitted = true;
    const html = renderSheet("Nobody");
    expect(html).toContain('data-testid="fault-unknown"');
    expect(html).toContain("No official manual link on file for this brand");
    expect(html).not.toContain("Open official");
  });

  it("shows only the found card for a known code", () => {
    h.state.code = "E133";
    h.state.submitted = true;
    const html = renderSheet("Baxi", "800 Combi");
    expect(html).toContain("Ignition failure — boiler will not light");
    expect(html).not.toContain('data-testid="fault-unknown"');
  });
});
