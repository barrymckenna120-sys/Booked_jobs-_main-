import { describe, it, expect } from "vitest";
import { ENGINEER_TOUR_STEPS } from "./engineerTourSteps";

describe("ENGINEER_TOUR_STEPS", () => {
  it("has six steps with sequential numbers", () => {
    expect(ENGINEER_TOUR_STEPS).toHaveLength(6);
    expect(ENGINEER_TOUR_STEPS.map((s) => s.number)).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it("carries exact user-approved copy", () => {
    expect(ENGINEER_TOUR_STEPS.map((s) => s.label)).toEqual([
      "Your jobs",
      "On the way",
      "On the job",
      "Certificates",
      "Parts & extra work",
      "Finish & get paid",
    ]);
    expect(ENGINEER_TOUR_STEPS.map((s) => s.title)).toEqual([
      "Your jobs, in order",
      "Get there and keep the office updated",
      "Everything about the job and the boiler",
      "Fill in certificates on your phone",
      "Parts and extra work",
      "Finish the job and take payment",
    ]);
    expect(ENGINEER_TOUR_STEPS[0].body).toBe(
      "Today, Upcoming and Completed are at the bottom of the screen. An amber flag means the office has left you a note — read it before you set off.",
    );
    expect(ENGINEER_TOUR_STEPS[5].benefits).toEqual([
      "Card or cash at the door",
      "Automatic receipt",
      "No Access recorded",
    ]);
  });

  it("has three benefits and an alt per step; images point at public/tour files", () => {
    for (const s of ENGINEER_TOUR_STEPS) {
      expect(s.benefits).toHaveLength(3);
      expect(s.alt.length).toBeGreaterThan(0);
      expect(s.hasImage).toBe(true);
      expect(s.image).toMatch(/^\/tour\/engineer-[a-z-]+\.webp$/);
    }
  });

  it("steps carry no routes — the engineer tour must not navigate", () => {
    for (const s of ENGINEER_TOUR_STEPS) {
      expect(s).not.toHaveProperty("route");
    }
  });
});
