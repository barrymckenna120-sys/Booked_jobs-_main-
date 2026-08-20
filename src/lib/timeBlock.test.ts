import { describe, it, expect } from "vitest";
import {
  timeBlockStartMinutes,
  timeBlockLabel,
  compareTimeBlocks,
  UNKNOWN_TIME_BLOCK_MINUTES,
  UNSCHEDULED_LABEL,
} from "./timeBlock";

const UUID = "3154c659-f98a-4167-902e-179a5eb870e1";

// Every distinct value found in production data, with its expected start minutes.
const PRODUCTION_VALUES: Array<[string | null, number]> = [
  ["2pm–5pm", 14 * 60],
  ["8am–11am", 8 * 60],
  ["9am–11am", 9 * 60],
  ["9am-11am", 9 * 60],
  ["11am–1pm", 11 * 60],
  ["11am–2pm", 11 * 60],
  ["8am-11am", 8 * 60],
  ["Morning", 8 * 60],
  ["2pm-5pm", 14 * 60],
  ["Afternoon", 14 * 60],
  ["Midday", 11 * 60],
  ["2pm -5pm", 14 * 60],
  ["1pm-3pm", 13 * 60],
  ["10am-12pm", 10 * 60],
  ["11am -1pm", 11 * 60],
  ["2pm-4pm", 14 * 60],
  ["9–11", 9 * 60],
  ["11am-1pm", 11 * 60],
  ["11–2", 11 * 60],
  ["9am - 11am", 9 * 60],
  ["8am-10am", 8 * 60],
  ["9am-12pm", 9 * 60],
  [UUID, UNKNOWN_TIME_BLOCK_MINUTES],
  [null, UNKNOWN_TIME_BLOCK_MINUTES],
  ["", UNKNOWN_TIME_BLOCK_MINUTES],
];

describe("timeBlockStartMinutes", () => {
  it.each(PRODUCTION_VALUES)("parses %j", (raw, expected) => {
    expect(timeBlockStartMinutes(raw)).toBe(expected);
  });

  it("never throws on junk", () => {
    for (const junk of [undefined, "  ", "not a time", "99am-100pm", "-", "–"]) {
      expect(() => timeBlockStartMinutes(junk as any)).not.toThrow();
      expect(timeBlockStartMinutes(junk as any)).toBe(UNKNOWN_TIME_BLOCK_MINUTES);
    }
  });

  it("handles minutes and midnight/noon edges", () => {
    expect(timeBlockStartMinutes("9:30am–11am")).toBe(9 * 60 + 30);
    expect(timeBlockStartMinutes("12pm–2pm")).toBe(12 * 60);
    expect(timeBlockStartMinutes("12am–3am")).toBe(0);
  });
});

describe("timeBlockLabel", () => {
  it("normalises all dash/spacing variants of the same slot", () => {
    for (const raw of ["9am–11am", "9am-11am", "9am - 11am"]) {
      expect(timeBlockLabel(raw)).toBe("9am–11am");
    }
    for (const raw of ["2pm–5pm", "2pm-5pm", "2pm -5pm"]) {
      expect(timeBlockLabel(raw)).toBe("2pm–5pm");
    }
    for (const raw of ["11am–1pm", "11am-1pm", "11am -1pm"]) {
      expect(timeBlockLabel(raw)).toBe("11am–1pm");
    }
  });

  it("maps word labels to their conventional windows", () => {
    expect(timeBlockLabel("Morning")).toBe("8am–11am");
    expect(timeBlockLabel("morning")).toBe("8am–11am");
    expect(timeBlockLabel("Midday")).toBe("11am–1pm");
    expect(timeBlockLabel("Afternoon")).toBe("2pm–5pm");
  });

  it("resolves legacy bare forms with the business-hours rule", () => {
    expect(timeBlockLabel("9–11")).toBe("9am–11am");
    expect(timeBlockLabel("11–2")).toBe("11am–2pm");
  });

  it("keeps unusual but parseable slots instead of dropping them", () => {
    expect(timeBlockLabel("10am-12pm")).toBe("10am–12pm");
    expect(timeBlockLabel("1pm-3pm")).toBe("1pm–3pm");
    expect(timeBlockLabel("8am-10am")).toBe("8am–10am");
    expect(timeBlockLabel("9am-12pm")).toBe("9am–12pm");
    expect(timeBlockLabel("11am–2pm")).toBe("11am–2pm");
    expect(timeBlockLabel("8am–11am")).toBe("8am–11am");
    expect(timeBlockLabel("2pm-4pm")).toBe("2pm–4pm");
  });

  it("falls back to Unscheduled for null/empty/UUID", () => {
    expect(timeBlockLabel(null)).toBe(UNSCHEDULED_LABEL);
    expect(timeBlockLabel(undefined)).toBe(UNSCHEDULED_LABEL);
    expect(timeBlockLabel("")).toBe(UNSCHEDULED_LABEL);
    expect(timeBlockLabel(UUID)).toBe(UNSCHEDULED_LABEL);
  });
});

describe("compareTimeBlocks", () => {
  it("sorts a mixed day chronologically with unknowns last", () => {
    const rows = ["2pm-5pm", "11am–1pm", null, "9am-11am", UUID, "1pm-3pm", "Morning", "10am-12pm"];
    const sorted = [...rows].sort(compareTimeBlocks);
    expect(sorted).toEqual([
      "Morning",
      "9am-11am",
      "10am-12pm",
      "11am–1pm",
      "1pm-3pm",
      "2pm-5pm",
      null,
      UUID,
    ]);
  });
});
