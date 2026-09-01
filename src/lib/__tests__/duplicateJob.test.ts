import { describe, it, expect } from "vitest";
import {
  duplicateMatchKey,
  canCheckDuplicate,
  duplicateRpcArgs,
  relativeSubmittedLabel,
  DUPLICATE_WINDOW_MINUTES,
} from "@/lib/duplicateJob";

/**
 * BJ-0131a — the matching rules themselves live in the shared DB function
 * `public.find_duplicate_job` (verified against the database, see ticket
 * notes). These tests cover the pure frontend contract: the acknowledgment
 * match key, the lookup preconditions and the RPC argument shape (trimmed
 * address, default 60-minute window, self-exclusion pass-through).
 */
describe("duplicateMatchKey", () => {
  it("is stable for the same phone + job type + address", () => {
    const a = duplicateMatchKey({ phone: "+353871234567", jobType: "Boiler Service", address: "12 Main Street" });
    const b = duplicateMatchKey({ phone: " +353871234567 ", jobType: "Boiler Service", address: " 12 Main Street " });
    expect(a).toBe(b);
  });

  it("changes when the job type changes", () => {
    const a = duplicateMatchKey({ phone: "+353871234567", jobType: "Boiler Service", address: "12 Main Street" });
    const b = duplicateMatchKey({ phone: "+353871234567", jobType: "Repair", address: "12 Main Street" });
    expect(a).not.toBe(b);
  });

  it("changes when the address changes", () => {
    const a = duplicateMatchKey({ phone: "+353871234567", jobType: "Boiler Service", address: "12 Main Street" });
    const b = duplicateMatchKey({ phone: "+353871234567", jobType: "Boiler Service", address: "12 Main St" });
    expect(a).not.toBe(b);
  });

  it("changes when the customer phone changes", () => {
    const a = duplicateMatchKey({ phone: "+353871234567", jobType: "Boiler Service", address: "12 Main Street" });
    const b = duplicateMatchKey({ phone: "+353879999999", jobType: "Boiler Service", address: "12 Main Street" });
    expect(a).not.toBe(b);
  });
});

describe("canCheckDuplicate", () => {
  const base = { organisationId: "org-a", phone: "0871234567", jobType: "Boiler Service", address: "12 Main Street" };

  it("requires organisation, phone, job type and address", () => {
    expect(canCheckDuplicate(base)).toBe(true);
    expect(canCheckDuplicate({ ...base, organisationId: "" })).toBe(false);
    expect(canCheckDuplicate({ ...base, phone: "  " })).toBe(false);
    expect(canCheckDuplicate({ ...base, jobType: "" })).toBe(false);
    expect(canCheckDuplicate({ ...base, address: "   " })).toBe(false);
  });
});

describe("duplicateRpcArgs", () => {
  it("trims the address, defaults the window and passes no exclusion", () => {
    expect(
      duplicateRpcArgs({ organisationId: "org-a", phone: " 087 123 4567 ", jobType: "Boiler Service", address: " 12 Main Street " }),
    ).toEqual({
      p_organisation_id: "org-a",
      p_phone: "087 123 4567",
      p_job_type: "Boiler Service",
      p_address: "12 Main Street",
      p_window_minutes: DUPLICATE_WINDOW_MINUTES,
      p_exclude_service_call_id: null,
    });
    expect(DUPLICATE_WINDOW_MINUTES).toBe(60);
  });

  it("passes the self-exclusion id and an explicit window through", () => {
    const args = duplicateRpcArgs({
      organisationId: "org-a",
      phone: "0871234567",
      jobType: "Repair",
      address: "12 Main Street",
      windowMinutes: 15,
      excludeServiceCallId: "job-1",
    });
    expect(args.p_window_minutes).toBe(15);
    expect(args.p_exclude_service_call_id).toBe("job-1");
  });
});

describe("relativeSubmittedLabel", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  it("formats minutes and hours", () => {
    expect(relativeSubmittedLabel("2026-09-01T11:40:00Z", now)).toBe("20 minutes ago");
    expect(relativeSubmittedLabel("2026-09-01T11:59:40Z", now)).toBe("less than a minute ago");
    expect(relativeSubmittedLabel("2026-09-01T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeSubmittedLabel("2026-09-01T10:00:00Z", now)).toBe("2 hours ago");
    expect(relativeSubmittedLabel("not-a-date", now)).toBe("recently");
  });
});
