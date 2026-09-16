import { describe, it, expect } from "vitest";
import { buildCustomerSinceDate } from "../customerSinceDate";

const today = new Date(2026, 8, 16); // 16/09/26

describe("buildCustomerSinceDate", () => {
  it("regression: picking a day first still produces a date", () => {
    expect(buildCustomerSinceDate("", "", "12", today)).toBe("2026-01-12");
  });

  it("picking a month first still produces a date", () => {
    expect(buildCustomerSinceDate("", "3", "", today)).toBe("2026-03-01");
  });

  it("picking a year first still produces a date", () => {
    expect(buildCustomerSinceDate("2019", "", "", today)).toBe("2019-01-01");
  });

  it("keeps a fully chosen date", () => {
    expect(buildCustomerSinceDate("2019", "7", "24", today)).toBe("2019-07-24");
  });

  it("clamps a day that the chosen month does not have", () => {
    expect(buildCustomerSinceDate("2019", "2", "31", today)).toBe("2019-02-28");
    expect(buildCustomerSinceDate("2020", "2", "31", today)).toBe("2020-02-29");
  });

  it("changing one part of an existing date keeps the others", () => {
    expect(buildCustomerSinceDate("2019", "7", "5", today)).toBe("2019-07-05");
    expect(buildCustomerSinceDate("2021", "7", "5", today)).toBe("2021-07-05");
  });
});
