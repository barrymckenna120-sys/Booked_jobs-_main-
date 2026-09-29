import { describe, it, expect } from "vitest";
import { bookingConfirmationMode } from "@/lib/bookingConfirmationMode";

const base = { needsScheduling: false, oldDate: "2026-10-01T12:00:00", oldBlock: "AM", newBlock: "AM" };

describe("bookingConfirmationMode", () => {
  it("Pending job with preferred date placed on a different day → confirm", () => {
    expect(bookingConfirmationMode({ ...base, status: "Pending", newDate: "2026-10-03T12:00:00" })).toBe("confirm");
    expect(bookingConfirmationMode({ ...base, status: "INCOMING", newDate: "2026-10-03T12:00:00" })).toBe("confirm");
  });
  it("Booked job moved to a new day → reschedule", () => {
    expect(bookingConfirmationMode({ ...base, status: "Booked", newDate: "2026-10-03T12:00:00" })).toBe("reschedule");
  });
  it("Booked job, same day and block, engineer changed → confirm", () => {
    expect(bookingConfirmationMode({ ...base, status: "Booked", newDate: "2026-10-01T12:00:00" })).toBe("confirm");
  });
  it("needs_scheduling, missing block or missing status → confirm", () => {
    expect(bookingConfirmationMode({ ...base, status: "Booked", needsScheduling: true, newDate: "2026-10-03" })).toBe("confirm");
    expect(bookingConfirmationMode({ ...base, status: "Booked", oldBlock: null, newDate: "2026-10-03" })).toBe("confirm");
    expect(bookingConfirmationMode({ ...base, status: null, newDate: "2026-10-03" })).toBe("confirm");
  });
  it("Booked job, same day, new block → reschedule", () => {
    expect(bookingConfirmationMode({ ...base, status: "Booked", newDate: "2026-10-01T12:00:00", newBlock: "PM" })).toBe("reschedule");
  });
});
