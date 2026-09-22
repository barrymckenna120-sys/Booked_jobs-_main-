import { describe, expect, it } from "vitest";
import {
  customerFillDecision,
  enquiryPhotoUrls,
  extractAttribution,
  extractContact,
  extractSubmissionId,
  flattenTallyPayload,
  imageTypeForUrl,
  isAcceptablePhotoSize,
  isAllowedEnquiryImage,
  isBoilerEnquiryStatus,
  mapBoilerEnquiryFields,
  MAX_ENQUIRY_PHOTO_BYTES,
  showsHeatPumpSection,
  validateEnquirySubmission,
} from "../boilerEnquiryPayload";

/** The brief's example submission (test data only). */
const tallyBody = {
  eventId: "evt-1",
  formId: "findmyboiler1",
  data: {
    submissionId: "sub-123",
    fields: [
      { key: "q_name", label: "Name", value: "Test Boiler Customer" },
      { key: "q_phone", label: "Mobile", value: "0871234567" },
      { key: "q_email", label: "Email", value: "Test.Customer@example.com" },
      { key: "q_address", label: "Address", value: "1 Test Road, Dublin" },
      { key: "q_eircode", label: "Eircode", value: "D01 AB12" },
      {
        key: "q_prop",
        label: "Property type",
        value: ["opt1"],
        options: [{ id: "opt1", text: "Semi-detached" }, { id: "opt2", text: "Detached" }],
      },
      { key: "q_beds", label: "Bedrooms", value: "3" },
      { key: "q_heat", label: "Current heating", value: "Gas boiler" },
      { key: "q_age", label: "Existing boiler age", value: "15-20 years" },
      { key: "q_loc", label: "Existing boiler location", value: "Kitchen" },
      { key: "q_same", label: "Same location", value: "Yes" },
      { key: "q_rads", label: "Radiator count", value: "11-15" },
      { key: "q_radage", label: "Radiator age", value: "Mixture" },
      { key: "q_baths", label: "Bathrooms", value: "1" },
      { key: "q_sim", label: "Simultaneous hot water usage", value: "Sometimes" },
      { key: "q_press", label: "Water pressure", value: "Average" },
      { key: "q_pump", label: "Existing water pump", value: "No" },
      { key: "q_cyl", label: "Hot water cylinder", value: "Yes" },
      { key: "q_prio", label: "Purchase priority", value: "Long warranty" },
      { key: "q_time", label: "Installation timeframe", value: "Within a month" },
      { key: "q_hp", label: "Heat pump interest", value: "Maybe" },
      { key: "q_ber", label: "BER", value: "C" },
      { key: "q_contact", label: "Preferred contact method", value: "WhatsApp" },
      { key: "q_smart", label: "Interested smart controls", value: "Yes" },
    ],
  },
  source: "Google",
  landing_page: "/boiler-prices/",
  utm_source: "google",
  utm_medium: "cpc",
};

describe("flattenTallyPayload", () => {
  it("flattens Tally fields by key and label, resolving choice options", () => {
    const flat = flattenTallyPayload(tallyBody);
    expect(flat.property_type).toBe("Semi-detached");
    expect(flat.bedrooms).toBe("3");
    expect(flat.q_name).toBe("Test Boiler Customer");
  });

  it("accepts a flat object of answers", () => {
    const flat = flattenTallyPayload({ Bedrooms: "4", phone: "0871234567" });
    expect(flat.bedrooms).toBe("4");
    expect(flat.phone).toBe("0871234567");
  });

  it("returns an empty map for junk input", () => {
    expect(flattenTallyPayload(null)).toEqual({});
    expect(flattenTallyPayload("nope")).toEqual({});
  });
});

describe("mapBoilerEnquiryFields", () => {
  const fields = mapBoilerEnquiryFields(flattenTallyPayload(tallyBody));

  it("maps the example submission onto enquiry columns", () => {
    expect(fields).toMatchObject({
      property_type: "Semi-detached",
      bedrooms: "3",
      address: "1 Test Road, Dublin",
      eircode: "D01 AB12",
      current_heating: "Gas boiler",
      existing_boiler_age: "15-20 years",
      existing_boiler_location: "Kitchen",
      boiler_relocation_required: "Yes",
      radiator_count: "11-15",
      radiator_age: "Mixture",
      bathroom_count: "1",
      simultaneous_hot_water_usage: "Sometimes",
      water_pressure: "Average",
      existing_water_pump: "No",
      hot_water_cylinder: "Yes",
      purchase_priority: "Long warranty",
      installation_timeframe: "Within a month",
      heat_pump_interest: "Maybe",
      ber: "C",
      preferred_contact_method: "WhatsApp",
      interested_smart_controls: true,
    });
  });

  it("leaves missing optional answers and absent conditional branches null", () => {
    expect(fields.floor_area).toBeNull();
    expect(fields.preferred_new_location).toBeNull();
    expect(fields.rooms_hard_to_heat_notes).toBeNull();
    expect(fields.cylinder_location).toBeNull();
    expect(fields.interested_heating_zones).toBeNull();
  });

  it("maps nothing from an empty submission", () => {
    const empty = mapBoilerEnquiryFields({});
    expect(Object.values(empty).every((v) => v === null)).toBe(true);
  });
});

describe("contact, attribution and submission id", () => {
  it("extracts the contact details", () => {
    expect(extractContact(flattenTallyPayload(tallyBody))).toEqual({
      name: "Test Boiler Customer",
      phone: "0871234567",
      email: "Test.Customer@example.com",
    });
  });

  it("extracts attribution including campaign tracking", () => {
    expect(extractAttribution(flattenTallyPayload(tallyBody))).toMatchObject({
      source: "Google",
      landing_page: "/boiler-prices/",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: null,
      referrer: null,
    });
  });

  it("prefers the Tally submission id for idempotency", () => {
    expect(extractSubmissionId(tallyBody)).toBe("sub-123");
    expect(extractSubmissionId({ eventId: "evt-9" })).toBe("evt-9");
    expect(extractSubmissionId({})).toBeNull();
  });
});

describe("validateEnquirySubmission", () => {
  it("accepts a submission with a phone", () => {
    expect(validateEnquirySubmission({ name: "A", phone: "0871234567", email: null }).ok).toBe(true);
  });

  it("rejects an email-only submission (a customer cannot exist without a phone)", () => {
    const result = validateEnquirySubmission({ name: null, phone: null, email: "a@b.ie" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("A contact phone number is required");
  });

  it("rejects a submission with no usable contact route", () => {
    const result = validateEnquirySubmission({ name: "A", phone: "12", email: "not-an-email" });
    expect(result.ok).toBe(false);
  });
});

describe("reworded live form questions", () => {
  const body = (fields: { key: string; label: string; value: unknown }[]) => ({
    data: { fields },
  });

  it("finds the phone, email, name, address and eircode behind reworded labels", () => {
    const flat = flattenTallyPayload(
      body([
        { key: "a1", label: "What's your full name?", value: "Test Boiler Customer" },
        { key: "a2", label: "Best number to reach you on?", value: "087 123 4567" },
        { key: "a3", label: "Where should we send your quote?", value: "test@example.com" },
        { key: "a4", label: "Property address", value: "1 Test Road, Dublin" },
        { key: "a5", label: "Eircode (if known)", value: "D02 X285" },
        { key: "a6", label: "How many bedrooms?", value: "3" },
        { key: "a7", label: "Number of radiators", value: "11-15" },
      ]),
    );
    expect(extractContact(flat)).toEqual({
      name: "Test Boiler Customer",
      phone: "087 123 4567",
      email: "test@example.com",
    });
    const fields = mapBoilerEnquiryFields(flat);
    expect(fields.address).toBe("1 Test Road, Dublin");
    expect(fields.eircode).toBe("D02 X285");
  });

  it("never mistakes a count answer for a phone number", () => {
    const flat = flattenTallyPayload(
      body([
        { key: "b1", label: "How many bedrooms?", value: "3" },
        { key: "b2", label: "Number of radiators", value: "11-15" },
        { key: "b3", label: "Your email", value: "a@b.ie" },
      ]),
    );
    expect(extractContact(flat).phone).toBeNull();
  });
});

describe("customerFillDecision", () => {
  it("fills only blank fields on an existing customer", () => {
    const { update } = customerFillDecision(
      { name: "Karl", phone: "+353871234567", email: null, address: "" },
      { name: "Test Boiler Customer", email: "new@example.com", address: "1 Test Road" },
    );
    expect(update).toEqual({ email: "new@example.com", address: "1 Test Road" });
  });

  it("never overwrites trusted data and surfaces the difference instead", () => {
    const { update, differences } = customerFillDecision(
      { address: "9 Old Street" },
      { address: "1 New Road" },
    );
    expect(update).toEqual({});
    expect(differences.address).toEqual({ existing: "9 Old Street", submitted: "1 New Road" });
  });

  it("ignores blank submitted values and case-only differences", () => {
    const { update, differences } = customerFillDecision(
      { name: "Karl" },
      { name: "karl", email: "" },
    );
    expect(update).toEqual({});
    expect(differences).toEqual({});
  });
});

describe("photo handling", () => {
  it("collects photo URLs from the shapes Tally sends", () => {
    expect(enquiryPhotoUrls({ photos: [{ url: "https://x/a.jpg" }, { url: "https://x/b.png" }] })).toEqual([
      "https://x/a.jpg",
      "https://x/b.png",
    ]);
    expect(enquiryPhotoUrls({ photo_video_upload: '["https://x/c.jpg"]' })).toEqual(["https://x/c.jpg"]);
  });

  it("returns nothing when no photos were submitted", () => {
    expect(enquiryPhotoUrls({ photos: null })).toEqual([]);
    expect(enquiryPhotoUrls({})).toEqual([]);
  });

  it("only accepts expected image formats and sizes", () => {
    expect(isAllowedEnquiryImage("image/jpeg")).toBe(true);
    expect(isAllowedEnquiryImage("image/png; charset=binary")).toBe(true);
    expect(isAllowedEnquiryImage("application/x-msdownload")).toBe(false);
    expect(isAllowedEnquiryImage("text/html")).toBe(false);
    expect(imageTypeForUrl("https://x/a.HEIC?sig=1")).toBe("image/heic");
    expect(imageTypeForUrl("https://x/a.exe")).toBeNull();
    expect(isAcceptablePhotoSize(1000)).toBe(true);
    expect(isAcceptablePhotoSize(MAX_ENQUIRY_PHOTO_BYTES + 1)).toBe(false);
    expect(isAcceptablePhotoSize(0)).toBe(false);
  });
});

describe("status and display rules", () => {
  it("accepts only the defined statuses", () => {
    expect(isBoilerEnquiryStatus("READY_TO_QUOTE")).toBe(true);
    expect(isBoilerEnquiryStatus("SCHEDULED")).toBe(false);
  });

  it("shows the heat pump section only when relevant", () => {
    expect(showsHeatPumpSection({ heat_pump_interest: "Maybe" })).toBe(true);
    expect(showsHeatPumpSection({ heat_pump_interest: "No" })).toBe(false);
    expect(showsHeatPumpSection({ heat_pump_interest: "No", ber: "C" })).toBe(true);
    expect(showsHeatPumpSection({})).toBe(false);
  });
});
