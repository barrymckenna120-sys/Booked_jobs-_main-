/**
 * Phase 3B — Tally "Find My Boiler" → structured new boiler enquiry.
 *
 * Pure payload logic only: flattening a Tally submission, mapping it onto the
 * `boiler_enquiries` columns, extracting attribution, deciding which blank
 * customer fields may be filled, and validating uploaded photos.
 *
 * This module is mirrored by `supabase/functions/_shared/boilerEnquiryPayload.ts`
 * (Edge Functions cannot import from `src/`). Keep the two in sync — the tests
 * here are the contract.
 */

// ---------------------------------------------------------------- status

export const BOILER_ENQUIRY_STATUSES = [
  "NEW",
  "CONTACTED",
  "NEEDS_INFO",
  "READY_TO_QUOTE",
  "QUOTED",
  "WON",
  "LOST",
] as const;

export type BoilerEnquiryStatus = (typeof BOILER_ENQUIRY_STATUSES)[number];

export const BOILER_ENQUIRY_STATUS_LABELS: Record<BoilerEnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  NEEDS_INFO: "Needs info",
  READY_TO_QUOTE: "Ready to quote",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
};

export const isBoilerEnquiryStatus = (value: unknown): value is BoilerEnquiryStatus =>
  typeof value === "string" && (BOILER_ENQUIRY_STATUSES as readonly string[]).includes(value);

// ---------------------------------------------------------------- flattening

const slug = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const scalar = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const parts = value
      .map((v) =>
        v && typeof v === "object"
          ? String((v as { text?: unknown; label?: unknown; value?: unknown }).text ??
              (v as { label?: unknown }).label ??
              (v as { value?: unknown }).value ??
              "")
          : String(v ?? ""),
      )
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return value;
};

/**
 * Accepts either a flat object of answers or a Tally webhook body
 * (`{ data: { fields: [{ key, label, value, options }] } }`) and returns one
 * flat map keyed by both the field key and the slugged label.
 */
export const flattenTallyPayload = (body: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return out;

  const root = body as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;

  for (const [key, value] of Object.entries(root)) {
    if (key === "data" || key === "fields") continue;
    out[slug(key)] = scalar(value);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === "fields") continue;
    out[slug(key)] = scalar(value);
  }

  const fields = (data.fields ?? root.fields) as unknown;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (!field || typeof field !== "object") continue;
      const f = field as Record<string, unknown>;
      const options = Array.isArray(f.options) ? (f.options as Record<string, unknown>[]) : [];
      let value: unknown = f.value;
      if (options.length && value != null) {
        const ids = Array.isArray(value) ? value.map(String) : [String(value)];
        const labels = ids
          .map((id) => options.find((o) => String(o.id) === id))
          .map((o) => (o ? String(o.text ?? o.label ?? "") : ""))
          .filter(Boolean);
        if (labels.length) value = labels.join(", ");
      }
      const resolved = scalar(value);
      for (const alias of [f.key, f.label]) {
        const k = slug(alias);
        if (k) out[k] = resolved;
      }
    }
  }
  return out;
};

const pick = (flat: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const raw = flat[key];
    if (raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (text) return text;
  }
  return null;
};

/**
 * Tally's own envelope keys. They are never customer answers, so loose matching
 * must ignore them — otherwise "formName" satisfies a /name/ match and the form
 * title gets saved as the customer's name.
 */
const TALLY_META_KEYS = new Set([
  "eventid",
  "eventtype",
  "createdat",
  "responseid",
  "submissionid",
  "respondentid",
  "formid",
  "formname",
  "submissionpdfurl",
  "submissionpreviewurl",
]);

/**
 * Live forms reword (and misspell) their questions — the production "Find My
 * Boiler" form asks "Moblie No" and "Priorty" — so an exact alias list alone
 * silently loses answers. `pickLoose` falls back to any answer whose question
 * name matches one of `patterns` AND whose value passes `accept`, so a loose
 * name match can never pull in an unrelated answer.
 */
const pickLoose = (
  flat: Record<string, unknown>,
  keys: string[],
  patterns: RegExp[],
  accept: (value: string) => boolean = () => true,
): string | null => {
  const exact = pick(flat, keys);
  if (exact && accept(exact)) return exact;
  for (const [key, raw] of Object.entries(flat)) {
    if (TALLY_META_KEYS.has(key)) continue;
    if (raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (!text || !accept(text)) continue;
    if (patterns.some((pattern) => pattern.test(key))) return text;
  }
  return exact;
};

/** True when the multi-select extras answer mentions `patterns`. */
const mentions = (value: string | null, patterns: RegExp[]): boolean | null => {
  if (!value) return null;
  return patterns.some((pattern) => pattern.test(value.toLowerCase()));
};

const digitCount = (value: string): number => value.replace(/\D/g, "").length;

export const looksLikePhone = (value: string): boolean => {
  if (!value || value.includes("@")) return false;
  const digits = digitCount(value);
  return digits >= 7 && digits <= 15;
};

export const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const TRUTHY = new Set(["true", "yes", "y", "1", "on", "checked"]);
const FALSY = new Set(["false", "no", "n", "0", "off", "unchecked"]);

const pickBool = (flat: Record<string, unknown>, keys: string[]): boolean | null => {
  for (const key of keys) {
    const raw = flat[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "boolean") return raw;
    const text = String(raw).trim().toLowerCase();
    if (!text) continue;
    if (TRUTHY.has(text)) return true;
    if (FALSY.has(text)) return false;
  }
  return null;
};

// ---------------------------------------------------------------- mapping

export type BoilerEnquiryFields = Record<string, string | boolean | null>;

/**
 * Tally answer → `boiler_enquiries` column mapping.
 *
 * Aliases include the live "Find My Boiler" question wording exactly as the
 * form asks it (including its "Moblie No" / "Priorty" spellings), and each
 * lookup also matches loosely on the question wording so a reworded question
 * keeps landing in the same column.
 */
export const mapBoilerEnquiryFields = (flat: Record<string, unknown>): BoilerEnquiryFields => {
  const extras = pickLoose(
    flat,
    ["interested_in_new_radiators_smart_controls_or_power_flushing", "interested_in"],
    [/interested_in/],
  );

  return {
    // property
    property_type: pick(flat, ["property_type", "type_of_property", "property"]),
    bedrooms: pickLoose(flat, ["bedrooms", "number_of_bedrooms", "how_many_bedrooms"], [/bedroom/]),
    floor_area: pick(flat, ["floor_area", "floor_area_sqm", "property_size"]),
    address: pickLoose(
      flat,
      ["address", "property_address", "street_address"],
      [/address/],
      (value) => !looksLikeEmail(value),
    ),
    eircode: pickLoose(flat, ["eircode", "eir_code", "postcode"], [/eir_?code/, /post_?code/]),

    // existing heating
    current_heating: pickLoose(
      flat,
      ["current_heating", "current_heating_system", "existing_heating", "boiler_type"],
      [/boiler_type/, /current_heating/],
    ),
    existing_gas_connection: pick(flat, ["existing_gas_connection", "gas_connection", "mains_gas"]),
    existing_boiler_age: pickLoose(
      flat,
      ["existing_boiler_age", "boiler_age", "age_of_boiler", "how_old_is_your_boiler"],
      [/age_of_boiler/, /boiler_age/],
    ),
    existing_boiler_location: pickLoose(
      flat,
      [
        "existing_boiler_location",
        "boiler_location",
        "current_boiler_location",
        "where_is_your_boiler",
      ],
      [/boiler_location/],
    ),
    boiler_relocation_required: pick(flat, [
      "boiler_relocation_required",
      "relocate_boiler",
      "same_location",
      "keep_boiler_in_same_location",
    ]),
    preferred_new_location: pick(flat, ["preferred_new_location", "new_boiler_location"]),

    // heating system
    radiator_count: pickLoose(
      flat,
      [
        "radiator_count",
        "radiators",
        "number_of_radiators",
        "how_many_radiators",
        "approx_no_of_radiators_used",
      ],
      [/radiator/],
    ),
    radiator_age: pick(flat, ["radiator_age", "age_of_radiators"]),
    rooms_hard_to_heat: pick(flat, ["rooms_hard_to_heat", "hard_to_heat_rooms", "any_rooms_hard_to_heat"]),
    rooms_hard_to_heat_notes: pick(flat, ["rooms_hard_to_heat_notes", "hard_to_heat_notes"]),
    existing_water_pump: pick(flat, ["existing_water_pump", "water_pump", "pump"]),

    // hot water
    bathroom_count: pickLoose(
      flat,
      ["bathroom_count", "bathrooms", "number_of_bathrooms", "how_many_bathrooms", "no_of_bathrooms"],
      [/bathroom/],
    ),
    hot_water_outlets: pick(flat, ["hot_water_outlets", "outlets"]),
    simultaneous_hot_water_usage: pickLoose(
      flat,
      [
        "simultaneous_hot_water_usage",
        "simultaneous_hot_water",
        "hot_water_at_the_same_time",
        "do_you_use_2_showers_at_the_same_time",
      ],
      [/same_time/, /simultaneous/],
    ),
    water_pressure: pickLoose(
      flat,
      ["water_pressure", "mains_water_pressure"],
      [/water_pressure/],
    ),
    poor_hot_water_flow: pick(flat, ["poor_hot_water_flow", "hot_water_flow"]),
    hot_water_cylinder: pickLoose(
      flat,
      [
        "hot_water_cylinder",
        "cylinder",
        "do_you_have_a_cylinder",
        "existing_hot_water_cylinder_or_pump",
      ],
      [/cylinder/],
    ),
    cylinder_location: pick(flat, ["cylinder_location", "where_is_the_cylinder"]),

    // preferences
    purchase_priority: pickLoose(
      flat,
      ["purchase_priority", "what_matters_most", "priority", "priorty"],
      [/prior/],
    ),
    installation_timeframe: pickLoose(
      flat,
      [
        "installation_timeframe",
        "timeframe",
        "when_do_you_want_it_installed",
        "when_would_you_like_the_work_completed",
      ],
      [/timeframe/, /when_would_you/, /when_do_you/],
    ),

    // interested extras — the live form asks these as one multi-select answer
    interested_radiators:
      pickBool(flat, ["interested_radiators", "new_radiators", "radiators_interest"]) ??
      mentions(extras, [/radiator/]),
    interested_smart_controls:
      pickBool(flat, ["interested_smart_controls", "smart_controls"]) ??
      mentions(extras, [/smart/, /control/]),
    interested_heating_zones:
      pickBool(flat, ["interested_heating_zones", "heating_zones", "zones"]) ??
      mentions(extras, [/zone/]),
    interested_system_flushing:
      pickBool(flat, ["interested_system_flushing", "system_flushing", "power_flush"]) ??
      mentions(extras, [/flush/]),
    interested_water_pressure_improvement:
      pickBool(flat, ["interested_water_pressure_improvement", "water_pressure_improvement"]) ??
      mentions(extras, [/pressure/]),

    // heat pump
    heat_pump_interest: pick(flat, ["heat_pump_interest", "heat_pump", "interested_in_a_heat_pump"]),
    ber: pick(flat, ["ber", "ber_rating", "energy_rating"]),
    insulation_upgraded: pick(flat, ["insulation_upgraded", "insulation", "has_insulation_been_upgraded"]),

    // contact
    preferred_contact_method: pickLoose(
      flat,
      [
        "preferred_contact_method",
        "contact_preference",
        "preferred_contact",
        "preferred_contact_phone_whatsapp_or_email",
      ],
      [/preferred_contact/],
    ),
  };
};

export type BoilerEnquiryContact = {
  name: string | null;
  phone: string | null;
  email: string | null;
};

export const extractContact = (flat: Record<string, unknown>): BoilerEnquiryContact => ({
  name: pickLoose(
    flat,
    ["name", "full_name", "customer_name", "your_name", "first_name", "contact_details"],
    [/name/, /contact_details/],
    (value) => !looksLikeEmail(value) && !looksLikePhone(value),
  ),
  phone: pickLoose(
    flat,
    [
      "phone",
      "mobile",
      "phone_number",
      "mobile_number",
      "contact_number",
      "telephone",
      "moblie_no",
      "mobile_no",
    ],
    // /mob/ deliberately covers the live form's "Moblie No" misspelling; every
    // loose match is still gated on the answer looking like a phone number.
    [/phone/, /mob/, /(^|_)tel(ephone)?($|_)/, /number/, /contact/],
    looksLikePhone,
  ),
  // An email-shaped answer is unambiguous, so any question may carry it
  // ("Where should we send your quote?").
  email: pickLoose(flat, ["email", "email_address", "your_email"], [/./], looksLikeEmail),
});

export type BoilerEnquiryAttribution = {
  source: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
};

export const extractAttribution = (flat: Record<string, unknown>): BoilerEnquiryAttribution => ({
  source: pick(flat, ["source", "lead_source", "how_did_you_find_us"]),
  landing_page: pick(flat, ["landing_page", "page", "page_url", "landing_url"]),
  utm_source: pick(flat, ["utm_source"]),
  utm_medium: pick(flat, ["utm_medium"]),
  utm_campaign: pick(flat, ["utm_campaign"]),
  utm_content: pick(flat, ["utm_content"]),
  utm_term: pick(flat, ["utm_term"]),
  referrer: pick(flat, ["referrer", "referer", "http_referrer"]),
});

/** The Tally submission id used for idempotency, from any of its aliases. */
export const extractSubmissionId = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : {}) as Record<string, unknown>;
  const candidates = [
    root.tally_submission_id,
    root.submission_id,
    data.submissionId,
    data.responseId,
    root.eventId,
    root.id,
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  return null;
};

// ---------------------------------------------------------------- customer fill

/**
 * Only blank customer fields may be filled from a public submission; anything
 * the office already holds is preserved and the difference is recorded instead.
 */
export const customerFillDecision = (
  existing: Record<string, unknown>,
  incoming: Record<string, string | null>,
): { update: Record<string, string>; differences: Record<string, { existing: string; submitted: string }> } => {
  const update: Record<string, string> = {};
  const differences: Record<string, { existing: string; submitted: string }> = {};

  for (const [field, submittedRaw] of Object.entries(incoming)) {
    const submitted = String(submittedRaw ?? "").trim();
    if (!submitted) continue;
    const current = String(existing?.[field] ?? "").trim();
    if (!current) {
      update[field] = submitted;
    } else if (current.toLowerCase() !== submitted.toLowerCase()) {
      differences[field] = { existing: current, submitted };
    }
  }
  return { update, differences };
};

// ---------------------------------------------------------------- photos

export const ALLOWED_ENQUIRY_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_ENQUIRY_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_ENQUIRY_PHOTOS = 10;
export const MAX_ENQUIRY_PAYLOAD_BYTES = 256 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Content type for a URL, from its extension. Unknown/unsafe → null. */
export const imageTypeForUrl = (url: string): string | null => {
  const clean = String(url ?? "").split("?")[0].split("#")[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
};

export const isAllowedEnquiryImage = (contentType: string | null | undefined): boolean => {
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return (ALLOWED_ENQUIRY_IMAGE_TYPES as readonly string[]).includes(type);
};

export const isAcceptablePhotoSize = (bytes: number | null | undefined): boolean =>
  typeof bytes === "number" && bytes > 0 && bytes <= MAX_ENQUIRY_PHOTO_BYTES;

const PHOTO_URL_RE = /^https?:\/\/\S+$/i;

/** Tolerant normalisation of Tally file answers into a list of http(s) URLs. */
export const normaliseEnquiryPhotoUrls = (input: unknown, depth = 0): string[] => {
  if (input == null || depth > 8) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(input.flatMap((entry) => normaliseEnquiryPhotoUrls(entry, depth + 1))));
  }
  if (typeof input === "object") {
    const url = (input as { url?: unknown }).url;
    if (typeof url === "string") return normaliseEnquiryPhotoUrls(url, depth + 1);
    return Array.from(
      new Set(
        Object.values(input as Record<string, unknown>).flatMap((v) =>
          normaliseEnquiryPhotoUrls(v, depth + 1),
        ),
      ),
    );
  }
  if (typeof input !== "string") return [];
  const raw = input.trim();
  if (!raw) return [];
  if (/^[[{]/.test(raw)) {
    try {
      return normaliseEnquiryPhotoUrls(JSON.parse(raw), depth + 1);
    } catch {
      // fall through — treat as a single URL
    }
  }
  return PHOTO_URL_RE.test(raw) ? [raw] : [];
};

const PHOTO_QUESTION_RE = /photo|image|upload|attachment/;

export const enquiryPhotoUrls = (flat: Record<string, unknown>): string[] => {
  const keys = ["photos", "photo", "photo_video_upload", "photo_upload", "uploads", "images", "boiler_photos"];
  const found = keys.flatMap((key) => normaliseEnquiryPhotoUrls(flat[key]));
  // The live form asks "Photos Current Boiler", so any upload question counts.
  // Tally's own submission links are excluded by TALLY_META_KEYS.
  for (const [key, value] of Object.entries(flat)) {
    if (TALLY_META_KEYS.has(key) || !PHOTO_QUESTION_RE.test(key)) continue;
    found.push(...normaliseEnquiryPhotoUrls(value));
  }
  return Array.from(new Set(found)).slice(0, MAX_ENQUIRY_PHOTOS);
};

// ---------------------------------------------------------------- validation

export type EnquiryValidation = { ok: true } | { ok: false; error: string };

/**
 * A submission is usable when it carries a phone number: a customer record
 * cannot exist without one, so accepting an email-only submission would fail at
 * the database instead of here. Everything else is optional — questionnaires
 * skip branches.
 */
export const validateEnquirySubmission = (contact: BoilerEnquiryContact): EnquiryValidation => {
  const hasPhone = Boolean(contact.phone && looksLikePhone(contact.phone));
  if (!hasPhone) {
    return { ok: false, error: "A contact phone number is required" };
  }
  return { ok: true };
};

/** Should the Heat Pump section be shown at all? */
export const showsHeatPumpSection = (enquiry: {
  heat_pump_interest?: string | null;
  ber?: string | null;
  insulation_upgraded?: string | null;
}): boolean => {
  const interest = String(enquiry.heat_pump_interest ?? "").trim().toLowerCase();
  if (interest && interest !== "no" && interest !== "not interested") return true;
  return Boolean(
    String(enquiry.ber ?? "").trim() || String(enquiry.insulation_upgraded ?? "").trim(),
  );
};
