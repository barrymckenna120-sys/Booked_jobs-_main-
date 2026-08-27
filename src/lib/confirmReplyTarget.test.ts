import { describe, it, expect } from "vitest";
import {
  resolveConfirmTarget,
  isEligibleConfirmJob,
  businessToday,
  type ConfirmCandidateJob,
} from "./confirmReplyTarget";

const TODAY = "2026-08-11";

const job = (over: Partial<ConfirmCandidateJob> = {}): ConfirmCandidateJob => ({
  id: "j1",
  scheduled_date: "2026-08-13",
  status: "Booked",
  reminder_2day_sent: true,
  ...over,
});

describe("isEligibleConfirmJob", () => {
  it("accepts a reminded, upcoming, booked job", () => {
    expect(isEligibleConfirmJob(job(), TODAY)).toBe(true);
  });

  it("accepts a job scheduled for today", () => {
    expect(isEligibleConfirmJob(job({ scheduled_date: TODAY }), TODAY)).toBe(true);
  });

  it("accepts Scheduled as well as Booked", () => {
    expect(isEligibleConfirmJob(job({ status: "Scheduled" }), TODAY)).toBe(true);
  });

  it("is tolerant of status casing and whitespace", () => {
    expect(isEligibleConfirmJob(job({ status: " booked " }), TODAY)).toBe(true);
  });

  it("excludes jobs in the past", () => {
    expect(isEligibleConfirmJob(job({ scheduled_date: "2026-08-10" }), TODAY)).toBe(false);
  });

  it("excludes jobs with no scheduled date", () => {
    expect(isEligibleConfirmJob(job({ scheduled_date: null }), TODAY)).toBe(false);
  });

  it("excludes jobs that never had the 2-day reminder sent", () => {
    expect(isEligibleConfirmJob(job({ reminder_2day_sent: false }), TODAY)).toBe(false);
    expect(isEligibleConfirmJob(job({ reminder_2day_sent: null }), TODAY)).toBe(false);
  });

  it("excludes jobs in a non-eligible status", () => {
    for (const status of ["Pending", "Completed", "Cancelled", "In Progress", null]) {
      expect(isEligibleConfirmJob(job({ status }), TODAY)).toBe(false);
    }
  });
});

describe("resolveConfirmTarget", () => {
  it("returns none for an empty or missing list", () => {
    expect(resolveConfirmTarget([], TODAY)).toEqual({ action: "none", reason: "no_eligible_job" });
    expect(resolveConfirmTarget(null, TODAY)).toEqual({ action: "none", reason: "no_eligible_job" });
    expect(resolveConfirmTarget(undefined, TODAY)).toEqual({ action: "none", reason: "no_eligible_job" });
  });

  it("returns none when no job passes eligibility", () => {
    const decision = resolveConfirmTarget(
      [job({ status: "Completed" }), job({ id: "j2", reminder_2day_sent: false })],
      TODAY
    );
    expect(decision).toEqual({ action: "none", reason: "no_eligible_job" });
  });

  it("acts when exactly one job is eligible", () => {
    const decision = resolveConfirmTarget(
      [job({ id: "past", scheduled_date: "2026-08-01" }), job({ id: "target" })],
      TODAY
    );
    expect(decision.action).toBe("act");
    if (decision.action === "act") expect(decision.job.id).toBe("target");
  });

  it("never guesses when two or more jobs are eligible", () => {
    const decision = resolveConfirmTarget(
      [
        job({ id: "later", scheduled_date: "2026-08-20" }),
        job({ id: "sooner", scheduled_date: "2026-08-13" }),
      ],
      TODAY
    );
    expect(decision.action).toBe("ambiguous");
    if (decision.action === "ambiguous") {
      expect(decision.jobs.map((j) => j.id)).toEqual(["sooner", "later"]);
    }
  });
});

describe("businessToday", () => {
  it("formats as YYYY-MM-DD in Europe/Dublin", () => {
    expect(businessToday(new Date("2026-08-11T10:00:00Z"))).toBe("2026-08-11");
  });

  it("uses the Dublin date, not UTC, late in the evening", () => {
    // 23:30 UTC on the 11th is 00:30 on the 12th in Dublin (UTC+1 in summer).
    expect(businessToday(new Date("2026-08-11T23:30:00Z"))).toBe("2026-08-12");
  });
});
