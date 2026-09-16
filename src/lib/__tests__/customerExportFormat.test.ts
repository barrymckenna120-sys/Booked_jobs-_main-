import { describe, expect, it } from "vitest";
import {
  cleanText,
  formatAreaCodeForExport,
  formatBoilerMakeModel,
  formatDateForExport,
  formatEircodeForExport,
  formatIdentifierForExport,
  formatPhoneForExport,
  formatServiceStatusForExport,
} from "../customerExportFormat";

describe("phone", () => {
  it("converts Irish 08 mobile to international", () => {
    expect(formatPhoneForExport("0862334444")).toBe("+353862334444");
  });
  it("preserves existing international numbers", () => {
    expect(formatPhoneForExport("+353862334444")).toBe("+353862334444");
  });
  it("strips spacing but keeps digits", () => {
    expect(formatPhoneForExport(" 086 233 4444 ")).toBe("+353862334444");
  });
  it("normalises 00 prefix and bare 353", () => {
    expect(formatPhoneForExport("00353862334444")).toBe("+353862334444");
    expect(formatPhoneForExport("353862334444")).toBe("+353862334444");
  });
  it("leaves blank and unusual values alone", () => {
    expect(formatPhoneForExport(null)).toBe("");
    expect(formatPhoneForExport("reception ext 12")).toBe("receptionext12");
  });
});

describe("eircode", () => {
  it("inserts the standard space", () => {
    expect(formatEircodeForExport("D24W289")).toBe("D24 W289");
  });
  it("handles non-Dublin routing keys", () => {
    expect(formatEircodeForExport("f91a123")).toBe("F91 A123");
    expect(formatEircodeForExport("H91 XY45")).toBe("H91 XY45");
  });
  it("keeps D6W routing key intact", () => {
    expect(formatEircodeForExport("D6WAB12")).toBe("D6W AB12");
  });
  it("leaves blank and non-Eircode values", () => {
    expect(formatEircodeForExport(null)).toBe("");
    expect(formatEircodeForExport("  no  eircode ")).toBe("NO EIRCODE");
  });
});

describe("area code", () => {
  it("corrects a Dublin district that captured the fourth Eircode character", () => {
    expect(formatAreaCodeForExport("D24W")).toBe("D24");
    expect(formatAreaCodeForExport("D04W")).toBe("D04");
  });
  it("keeps genuine Dublin districts unchanged", () => {
    ["D1", "D2", "D4", "D6", "D12", "D15", "D16", "D18", "D22", "D24", "D6W"].forEach((code) => {
      expect(formatAreaCodeForExport(code)).toBe(code);
    });
  });
  it("passes non-Dublin values through cleaned only", () => {
    expect(formatAreaCodeForExport("co galway  ")).toBe("co galway");
    expect(formatAreaCodeForExport("Kildare")).toBe("Kildare");
  });
  it("returns blank for empty", () => {
    expect(formatAreaCodeForExport(null)).toBe("");
  });
});

describe("dates", () => {
  it("exports ISO date-only", () => {
    expect(formatDateForExport("2027-09-16")).toBe("2027-09-16");
    expect(formatDateForExport("2027-09-16T00:00:00Z")).toBe("2027-09-16");
  });
  it("converts legacy DD/MM/YYYY without timezone shift", () => {
    expect(formatDateForExport("16/09/2027")).toBe("2027-09-16");
  });
  it("keeps blanks blank", () => {
    expect(formatDateForExport(null)).toBe("");
    expect(formatDateForExport("")).toBe("");
  });
});

describe("service status", () => {
  it("maps the legacy placeholder to the UI vocabulary", () => {
    expect(formatServiceStatusForExport("active")).toBe("Up to Date");
    expect(formatServiceStatusForExport("Active")).toBe("Up to Date");
  });
  it("preserves the distinct statuses", () => {
    ["Up to Date", "Due Soon", "Overdue", "Serviced"].forEach((s) => {
      expect(formatServiceStatusForExport(s)).toBe(s);
    });
  });
  it("keeps blank blank", () => {
    expect(formatServiceStatusForExport(null)).toBe("");
  });
});

describe("identifiers and text", () => {
  it("exports GPRN exactly as stored", () => {
    expect(formatIdentifierForExport("07001234567")).toBe("07001234567");
    expect(formatIdentifierForExport(null)).toBe("");
  });
  it("collapses duplicate spaces in addresses without changing case", () => {
    expect(cleanText("20  hollywood   drive ")).toBe("20 hollywood drive");
    expect(cleanText("Apt. 4, St. John's Rd.")).toBe("Apt. 4, St. John's Rd.");
  });
  it("falls back to brand/model when the combined field is empty", () => {
    expect(formatBoilerMakeModel(null, "Ideal", "Logic 24")).toBe("Ideal Logic 24");
    expect(formatBoilerMakeModel("Vaillant ecoTEC", "Ideal", "Logic")).toBe("Vaillant ecoTEC");
    expect(formatBoilerMakeModel(null, null, null)).toBe("");
  });
});
