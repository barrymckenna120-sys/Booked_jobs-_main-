import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TourCloseButton from "./TourCloseButton";

describe("TourCloseButton", () => {
  it("renders an explicit exit control with a 44px touch target", () => {
    const html = renderToStaticMarkup(<TourCloseButton onClose={() => undefined} />);

    expect(html).toContain('aria-label="Exit tour"');
    expect(html).toContain("h-11");
    expect(html).toContain("w-11");
  });
});