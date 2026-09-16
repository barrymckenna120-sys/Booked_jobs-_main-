import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Edge Function copy of the fingerprint logic must stay identical to the
 * tested one in `src/lib/bookingIntakeClaim.ts` (Edge Functions cannot import
 * from `src/`). This compares the shared pure functions character for
 * character, ignoring the Edge-only claim helpers below them.
 */
const pureSection = (source: string): string => {
  const start = source.indexOf("export const BOOKING_CLAIM_WINDOW_MINUTES");
  const end = source.indexOf("export type BookingClaim");
  const slice = end === -1 ? source.slice(start) : source.slice(start, end);
  return slice.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
};

describe("booking intake fingerprint mirror", () => {
  it("edge copy matches the tested implementation", () => {
    const app = readFileSync("src/lib/bookingIntakeClaim.ts", "utf8");
    const edge = readFileSync("supabase/functions/_shared/bookingIntakeClaim.ts", "utf8");
    expect(pureSection(edge)).toBe(pureSection(app));
  });
});
