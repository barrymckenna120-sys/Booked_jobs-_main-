// Per-form Tally mappings keyed by stable Tally field KEY (not label), so later
// label renames on the form don't break intake. Pure — no I/O.

export type TallyFormMap = {
  source: string;
  enquiryType: string;
  contact: { name: string; phone: string; email: string };
  columns: Record<string, string>; // tally key -> boiler_enquiries column
  notes: { key: string; label: string }[]; // readable list, in this order
  photos: string[];
};

export const TALLY_FORM_MAPS: Record<string, TallyFormMap> = {
  Zjq5rA: {
    source: "kn-website-new-boiler",
    enquiryType: "new_boiler",
    contact: { name: "question_OBVJg7", phone: "question_4NGoqk", email: "question_EbaJgX" },
    columns: {
      question_V1xMdJ: "eircode",
      question_PBPXg5: "address",
      question_rrqdpl: "preferred_contact_method",
      question_oVx7gP: "property_type",
      question_GB7JkZ: "bedrooms",
      question_OBVJrR: "radiator_count",
      question_PBPX4V: "existing_boiler_age",
      question_EbaJA4: "existing_boiler_location",
      question_rrqdgN: "bathroom_count",
      question_4NGoqX: "simultaneous_hot_water_usage",
      question_j9E7pa: "water_pressure",
      question_2xRJZj: "hot_water_cylinder",
      question_j9E7px: "existing_boiler_working",
      question_xN6Por: "purchase_priority",
      question_oVx7pe: "installation_timeframe",
    },
    notes: [
      { key: "question_oVx7gP", label: "Property" },
      { key: "question_GB7JkZ", label: "Bedrooms" },
      { key: "question_OBVJrR", label: "Radiators" },
      { key: "question_V1xMqg", label: "Boiler type" },
      { key: "question_PBPX4V", label: "Boiler age" },
      { key: "question_EbaJA4", label: "Boiler location" },
      { key: "question_rrqdgN", label: "Bathrooms" },
      { key: "question_4NGoqX", label: "2 showers at once" },
      { key: "question_j9E7pa", label: "Water pressure" },
      { key: "question_2xRJZj", label: "Cylinder/pump" },
      { key: "question_j9E7px", label: "Boiler working" },
      { key: "question_xN6Por", label: "Priority" },
      { key: "question_RBrJgd", label: "Extras" },
      { key: "question_oVx7pe", label: "When to complete" },
    ],
    photos: ["question_GB7Jgp"],
  },
};

type TallyField = { key?: string; label?: string; type?: string; value?: unknown; options?: { id?: string; text?: string }[] };

const fieldsOf = (body: unknown): TallyField[] => {
  const root = (body ?? {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  return Array.isArray(data.fields) ? (data.fields as TallyField[]) : [];
};

/** Human-readable text for a Tally field value (choice ids → option text). */
export const tallyValueText = (f: TallyField): string | null => {
  const v = f.value;
  if (v == null || v === "") return null;
  const opts = Array.isArray(f.options) ? f.options : [];
  const one = (x: unknown): string => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return String(o.name ?? o.url ?? o.text ?? JSON.stringify(o));
    }
    const hit = opts.find((o) => o.id === x);
    return hit?.text ? String(hit.text) : String(x);
  };
  const text = Array.isArray(v) ? v.map(one).filter(Boolean).join(", ") : one(v);
  return text.trim() || null;
};

const photoUrlsOf = (f: TallyField): string[] =>
  Array.isArray(f.value)
    ? (f.value as unknown[])
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>).url : x))
        .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
    : typeof f.value === "string" && /^https?:\/\//.test(f.value) ? [f.value] : [];

export type MappedTallyForm = {
  contact: { name: string | null; phone: string | null; email: string | null };
  columns: Record<string, string | null>;
  notes: { survey_answers: { label: string; value: string }[]; other_answers: { label: string; value: string }[]; photo_urls: string[] };
  photoUrls: string[];
  source: string;
  enquiryType: string;
};

export const mapTallyForm = (map: TallyFormMap, body: unknown): MappedTallyForm => {
  const byKey = new Map<string, TallyField>();
  for (const f of fieldsOf(body)) if (f?.key) byKey.set(String(f.key), f);
  const text = (k: string) => {
    const f = byKey.get(k);
    return f ? tallyValueText(f) : null;
  };

  const columns: Record<string, string | null> = {};
  for (const [k, col] of Object.entries(map.columns)) {
    const t = text(k);
    if (t) columns[col] = t;
  }

  const survey_answers = map.notes
    .map((n) => ({ label: n.label, value: text(n.key) }))
    .filter((a): a is { label: string; value: string } => !!a.value);

  const known = new Set<string>([
    ...Object.values(map.contact),
    ...Object.keys(map.columns),
    ...map.notes.map((n) => n.key),
    ...map.photos,
  ]);
  const other_answers: { label: string; value: string }[] = [];
  for (const [k, f] of byKey) {
    if (known.has(k)) continue;
    const t = tallyValueText(f);
    if (t) other_answers.push({ label: String(f.label ?? k).trim() || k, value: t });
  }

  const photoUrls = map.photos.flatMap((k) => (byKey.get(k) ? photoUrlsOf(byKey.get(k)!) : []));

  return {
    contact: { name: text(map.contact.name), phone: text(map.contact.phone), email: text(map.contact.email) },
    columns,
    notes: { survey_answers, other_answers, photo_urls: photoUrls },
    photoUrls,
    source: map.source,
    enquiryType: map.enquiryType,
  };
};
