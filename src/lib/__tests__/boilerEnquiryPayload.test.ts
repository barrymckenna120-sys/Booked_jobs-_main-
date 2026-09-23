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
    expect((result as { error?: string }).error).toBe("A contact phone number is required");
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

/**
 * The production "Find My Boiler" form (68qaMe) — exact question wording and
 * envelope taken from the live submissions logged on 22/09/26, including its
 * "Moblie No" and "Priorty" spellings. Test data only.
 */
describe("live Find My Boiler form (68qaMe)", () => {
  const liveBody = {
    eventId: "evt-live",
    eventType: "FORM_RESPONSE",
    createdAt: "2026-09-22T15:57:00.000Z",
    data: {
      responseId: "resp-live",
      submissionId: "KpyvRvA",
      respondentId: "resp-1",
      formId: "68qaMe",
      formName: "Find My Boiler",
      submissionPdfUrl: "https://tally.so/pdf/KpyvRvA.pdf",
      fields: [
        { key: "question_dv5bgl", label: "Property", value: "Semi-detached" },
        { key: "question_lllbeo", label: "How many bedrooms", value: "3" },
        { key: "question_rbrxnk", label: "Approx No of radiators used", value: "11-15" },
        { key: "question_gbl6ge", label: "Boiler type", value: "Gas boiler" },
        { key: "question_obla2a", label: "Age of boiler", value: "15-20 years" },
        { key: "question_v1vgej", label: "Current boiler location", value: "Kitchen" },
        { key: "question_pblpx1", label: "No of bathrooms", value: "1" },
        { key: "question_eblkrl", label: "Do you use 2 showers at the same time", value: "Sometimes" },
        {
          key: "question_rrv54o",
          label: "Do you have good water pressure (good, average, poor, not sure)",
          value: "Average",
        },
        { key: "question_4nlq6r", label: "Existing hot water cylinder or pump", value: "Cylinder, no pump" },
        { key: "question_wklz9r", label: "Is your current boiler working ?", value: "Yes" },
        { key: "question_j9lzrq", label: "Priorty", value: "Long warranty" },
        {
          key: "question_2xlxwe",
          label: "Interested in new radiators, smart controls or power flushing",
          value: "New radiators, Power flushing",
        },
        { key: "question_xn2rqd", label: "When would you like the work completed", value: "Within a month" },
        {
          key: "question_zrl87v",
          label: "Photos current boiler",
          value: [{ url: "https://storage.tally.so/boiler.jpg" }],
        },
        { key: "question_nblrj0", label: "Contact details", value: "Test Boiler Customer" },
        { key: "question_v1vay6", label: "Moblie No", value: "087 123 4567" },
        { key: "question_qbd1zy", label: "Eircode", value: "D02 X285" },
        { key: "question_9jobke", label: "Address", value: "1 Test Road, Dublin" },
        { key: "question_exlmjx", label: "Email", value: "test.customer@example.com" },
        { key: "question_wpp2we", label: "Preferred contact phone, WhatsApp or email", value: "WhatsApp" },
      ],
    },
  };

  const flat = flattenTallyPayload(liveBody);

  it("reads the customer's contact details, not Tally's own envelope", () => {
    expect(extractContact(flat)).toEqual({
      name: "Test Boiler Customer",
      phone: "087 123 4567",
      email: "test.customer@example.com",
    });
  });

  it("passes validation", () => {
    expect(validateEnquirySubmission(extractContact(flat)).ok).toBe(true);
  });

  it("maps every answered question to its column", () => {
    const fields = mapBoilerEnquiryFields(flat);
    expect(fields.property_type).toBe("Semi-detached");
    expect(fields.bedrooms).toBe("3");
    expect(fields.radiator_count).toBe("11-15");
    expect(fields.current_heating).toBe("Gas boiler");
    expect(fields.existing_boiler_age).toBe("15-20 years");
    expect(fields.existing_boiler_working).toBe("Yes");
    expect(fields.existing_boiler_location).toBe("Kitchen");
    expect(fields.bathroom_count).toBe("1");
    expect(fields.simultaneous_hot_water_usage).toBe("Sometimes");
    expect(fields.water_pressure).toBe("Average");
    expect(fields.hot_water_cylinder).toBe("Cylinder, no pump");
    expect(fields.purchase_priority).toBe("Long warranty");
    expect(fields.installation_timeframe).toBe("Within a month");
    expect(fields.preferred_contact_method).toBe("WhatsApp");
    expect(fields.address).toBe("1 Test Road, Dublin");
    expect(fields.eircode).toBe("D02 X285");
  });

  it("splits the multi-select extras answer into flags", () => {
    const fields = mapBoilerEnquiryFields(flat);
    expect(fields.interested_radiators).toBe(true);
    expect(fields.interested_system_flushing).toBe(true);
    expect(fields.interested_smart_controls).toBe(false);
    expect(fields.interested_heating_zones).toBe(false);
  });

  it("picks up the uploaded boiler photo", () => {
    expect(enquiryPhotoUrls(flat)).toEqual(["https://storage.tally.so/boiler.jpg"]);
  });

  it("never stores Tally's submission pdf as a customer photo or the form name as the customer", () => {
    expect(enquiryPhotoUrls(flat)).not.toContain("https://tally.so/pdf/KpyvRvA.pdf");
    expect(extractContact(flat).name).not.toBe("Find My Boiler");
  });
});

/**
 * The live form's labels were corrected to "Mobile Number" and "Priority" on
 * 22/09/26. Both spellings must keep working, because a delayed Tally retry can
 * still deliver a submission captured under the old wording.
 */
describe("corrected live form labels (both spellings)", () => {
  const contactFields = (mobileLabel: string, priorityLabel: string) => [
    { key: "question_nblrj0", label: "Contact details", value: "Test Boiler Customer" },
    { key: "question_v1vay6", label: mobileLabel, value: "087 123 4567" },
    { key: "question_exlmjx", label: "Email", value: "test.customer@example.com" },
    { key: "question_j9lzrq", label: priorityLabel, value: "Long warranty" },
  ];

  for (const [mobileLabel, priorityLabel] of [
    ["Mobile Number", "Priority"],
    ["Moblie No", "Priorty"],
  ]) {
    it(`reads "${mobileLabel}" and "${priorityLabel}"`, () => {
      const flat = flattenTallyPayload({ data: { fields: contactFields(mobileLabel, priorityLabel) } });
      expect(extractContact(flat).phone).toBe("087 123 4567");
      expect(extractContact(flat).name).toBe("Test Boiler Customer");
      expect(validateEnquirySubmission(extractContact(flat)).ok).toBe(true);
      expect(mapBoilerEnquiryFields(flat).purchase_priority).toBe("Long warranty");
    });
  }
});

/**
 * Completeness guard: every question the live form asks must reach a column or
 * flag. Uses the corrected labels.
 */
describe("live form completeness (corrected labels)", () => {
  const flat = flattenTallyPayload({
    data: {
      formId: "68qaMe",
      formName: "Find My Boiler",
      submissionId: "completeness-1",
      fields: [
        { key: "q1", label: "Property", value: "Semi-detached" },
        { key: "q2", label: "How many bedrooms", value: "3" },
        { key: "q3", label: "Approx No of radiators used", value: "11-15" },
        { key: "q4", label: "Boiler type", value: "Gas boiler" },
        { key: "q5", label: "Age of boiler", value: "15-20 years" },
        { key: "q6", label: "Current boiler location", value: "Kitchen" },
        { key: "q7", label: "No of bathrooms", value: "1" },
        { key: "q8", label: "Do you use 2 showers at the same time", value: "Sometimes" },
        { key: "q9", label: "Do you have good water pressure", value: "Average" },
        { key: "q10", label: "Existing hot water cylinder or pump", value: "Cylinder, no pump" },
        { key: "q11", label: "Priority", value: "Long warranty" },
        { key: "q12", label: "Interested in new radiators, smart controls or power flushing", value: "Smart controls" },
        { key: "q13", label: "When would you like the work completed", value: "Within a month" },
        { key: "q14", label: "Photos current boiler", value: [{ url: "https://storage.tally.so/a.png" }] },
        { key: "q15", label: "Contact details", value: "Test Boiler Customer" },
        { key: "q16", label: "Mobile Number", value: "087 123 4567" },
        { key: "q17", label: "Eircode", value: "D02 X285" },
        { key: "q18", label: "Address", value: "1 Test Road, Dublin" },
        { key: "q19", label: "Email", value: "test.customer@example.com" },
        { key: "q20", label: "Preferred contact phone, WhatsApp or email", value: "WhatsApp" },
      ],
    },
  });

  it("populates every column the live form supplies", () => {
    const fields = mapBoilerEnquiryFields(flat);
    for (const column of [
      "property_type",
      "bedrooms",
      "radiator_count",
      "current_heating",
      "existing_boiler_age",
      "existing_boiler_location",
      "bathroom_count",
      "simultaneous_hot_water_usage",
      "water_pressure",
      "hot_water_cylinder",
      "purchase_priority",
      "installation_timeframe",
      "preferred_contact_method",
      "address",
      "eircode",
    ]) {
      expect(fields[column], column).toBeTruthy();
    }
    expect(fields.interested_smart_controls).toBe(true);
    expect(fields.interested_radiators).toBe(false);
  });

  it("keeps the photo and the contact details", () => {
    expect(enquiryPhotoUrls(flat)).toEqual(["https://storage.tally.so/a.png"]);
    expect(extractContact(flat)).toEqual({
      name: "Test Boiler Customer",
      phone: "087 123 4567",
      email: "test.customer@example.com",
    });
  });

  it("leaves questions the form does not ask empty rather than guessing", () => {
    const fields = mapBoilerEnquiryFields(flat);
    expect(fields.heat_pump_interest).toBeNull();
    expect(fields.ber).toBeNull();
    expect(fields.floor_area).toBeNull();
    expect(fields.radiator_age).toBeNull();
  });
});
