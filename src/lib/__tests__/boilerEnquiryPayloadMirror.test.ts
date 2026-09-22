/**
 * The Edge Function copy of the boiler enquiry payload logic must stay
 * identical to the tested one in `src/lib/boilerEnquiryPayload.ts` (Edge
 * Functions cannot import from `src/`).
 */
import { describe, expect, it } from "vitest";
import edgeSource from "../../../supabase/functions/_shared/boilerEnquiryPayload.ts?raw";
import appSource from "../boilerEnquiryPayload?raw";

const body = (source: string): string => {
  const start = source.indexOf("export const BOILER_ENQUIRY_STATUSES");
  return source
    .slice(start)
    .replace(/\/\*\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
};

describe("boiler enquiry payload mirror", () => {
  it("edge copy matches the tested implementation", () => {
    expect(body(edgeSource)).toBe(body(appSource));
  });
});
