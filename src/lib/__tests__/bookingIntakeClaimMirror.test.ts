/**
 * The Edge Function copy of the fingerprint logic must stay identical to the
 * tested one in `src/lib/bookingIntakeClaim.ts` (Edge Functions cannot import
 * from `src/`). This compares the shared pure functions, ignoring the
 * Edge-only claim helpers below them.
 */
import { describe, expect, it } from "vitest";
// ?raw gives us the file text without executing it, so this is a pure content diff.
import edgeSource from "../../../supabase/functions/_shared/bookingIntakeClaim.ts?raw";
import appSource from "../bookingIntakeClaim?raw";

const pureSection = (source: string): string => {
  const start = source.indexOf("export const BOOKING_CLAIM_WINDOW_MINUTES");
  const end = source.indexOf("export type BookingClaim");
  const slice = end === -1 ? source.slice(start) : source.slice(start, end);
  return slice.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
};

describe("booking intake fingerprint mirror", () => {
  it("edge copy matches the tested implementation", () => {
    expect(pureSection(edgeSource)).toBe(pureSection(appSource));
  });
});
