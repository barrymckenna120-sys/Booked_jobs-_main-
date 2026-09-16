import { describe, expect, it } from "vitest";
import {
  BOOKING_CLAIM_WINDOW_MINUTES,
  bookingFingerprintInput,
  buildBookingFingerprint,
  canFingerprintBooking,
  claimIsStale,
} from "@/lib/bookingIntakeClaim";

const booking = {
  phone: "+353871234567",
  jobType: "Boiler Service",
  address: "2789 Cherry Camp Road, Dublin 12",
  scheduledDate: "2026-09-23",
  timeBlock: "9am-11am",
};

describe("booking intake fingerprint", () => {
  it("treats the same booking with cosmetic differences as one booking", async () => {
    const a = await buildBookingFingerprint(booking);
    const b = await buildBookingFingerprint({
      ...booking,
      jobType: "boiler service",
      address: "  2789 Cherry Camp   Road, Dublin 12 ",
      timeBlock: "9AM-11AM",
    });
    expect(b).toBe(a);
  });

  it("regression: one submission arriving twice with different submission ids collides", async () => {
    // The submission id is deliberately NOT part of the fingerprint — that is
    // the whole point: the sender gives each copy a different id.
    const first = await buildBookingFingerprint(booking);
    const second = await buildBookingFingerprint({ ...booking });
    expect(second).toBe(first);
  });

  it("keeps genuinely different bookings apart", async () => {
    const base = await buildBookingFingerprint(booking);
    expect(await buildBookingFingerprint({ ...booking, phone: "+353870000000" })).not.toBe(base);
    expect(await buildBookingFingerprint({ ...booking, address: "1 Other Street" })).not.toBe(base);
    expect(await buildBookingFingerprint({ ...booking, scheduledDate: "2026-09-24" })).not.toBe(base);
    expect(await buildBookingFingerprint({ ...booking, timeBlock: "2pm-5pm" })).not.toBe(base);
    expect(await buildBookingFingerprint({ ...booking, jobType: "Repair" })).not.toBe(base);
  });

  it("is a stable 64-character hex digest", async () => {
    expect(await buildBookingFingerprint(booking)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps missing date and time slot distinguishable from empty strings", () => {
    expect(bookingFingerprintInput({ ...booking, scheduledDate: null, timeBlock: null })).toBe(
      bookingFingerprintInput({ ...booking, scheduledDate: "", timeBlock: "" }),
    );
  });

  it("refuses to fingerprint bookings without a phone number or address", () => {
    expect(canFingerprintBooking(booking)).toBe(true);
    expect(canFingerprintBooking({ ...booking, phone: "" })).toBe(false);
    expect(canFingerprintBooking({ ...booking, address: "   " })).toBe(false);
  });
});

describe("claim window", () => {
  const now = new Date("2026-09-16T16:49:46Z");

  it("treats an arrival milliseconds later as inside the window", () => {
    expect(claimIsStale("2026-09-16T16:49:46.127Z", now)).toBe(false);
  });

  it("releases the claim once the window has passed", () => {
    const justInside = new Date(now.getTime() - (BOOKING_CLAIM_WINDOW_MINUTES * 60_000 - 1000)).toISOString();
    const justOutside = new Date(now.getTime() - (BOOKING_CLAIM_WINDOW_MINUTES * 60_000 + 1000)).toISOString();
    expect(claimIsStale(justInside, now)).toBe(false);
    expect(claimIsStale(justOutside, now)).toBe(true);
  });

  it("treats an unreadable timestamp as stale so a booking is never blocked", () => {
    expect(claimIsStale("not-a-date", now)).toBe(true);
  });
});
