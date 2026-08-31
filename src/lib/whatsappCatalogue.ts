/**
 * Frontend view of the WhatsApp message catalogue.
 *
 * The message inventory itself is NOT authored here. It is derived from
 * `whatsappCatalogue.generated.ts`, a byte mirror of the canonical
 * `supabase/functions/_shared/whatsappCatalogue.ts` produced by
 * `scripts/generate-whatsapp-catalogue.mjs`. That removes the old drift risk
 * where the Admin panel described one wording and the Edge Functions sent
 * another.
 *
 * What still lives here is display-layer only: the admin-facing config-key
 * labels, live tenant config resolution (`settings` + `tenant_integrations`),
 * status derivation and preview rendering. Tenant values are never stored in
 * the catalogue, so it cannot go stale when config is edited.
 *
 * Read-only: nothing in this module writes to the database or sends a message.
 */

import {
  WHATSAPP_CATALOGUE as CANONICAL_CATALOGUE,
  type CatalogueEntry,
  type MessageCategory,
} from "./whatsappCatalogue.generated";

export { CANONICAL_CATALOGUE };
export type { CatalogueEntry, MessageCategory };

// ---------------------------------------------------------------------------
// Config keys
// ---------------------------------------------------------------------------

export type ConfigKeyId =
  | "message_footer"
  | "company_name"
  | "company_phone"
  | "google_review_url"
  | "renewal_form_url"
  | "new_booking_url"
  | "cert_prefix"
  | "whatsapp_api_key_secret"
  | "stripe_payment_link"
  | "sumup_merchant_code";

export interface ConfigKeyDef {
  id: ConfigKeyId;
  label: string;
  /** Where an admin edits it. */
  editedIn: string;
  /** Human description of the resolution chain used by the Edge Functions. */
  resolution: string;
}

export const CONFIG_KEYS: Record<ConfigKeyId, ConfigKeyDef> = {
  message_footer: {
    id: "message_footer",
    label: "Message footer",
    editedIn: "Settings → General",
    resolution: "settings.message_footer → settings.business_name → settings.company_name",
  },
  company_name: {
    id: "company_name",
    label: "Company name",
    editedIn: "Settings → General / Customer Integrations → Business Details",
    resolution: "settings.business_name → settings.company_name",
  },
  company_phone: {
    id: "company_phone",
    label: "Company phone",
    editedIn: "Settings → General / Customer Integrations → Business Details",
    resolution: "settings.business_phone → settings.company_phone",
  },
  google_review_url: {
    id: "google_review_url",
    label: "Google review URL",
    editedIn: "Settings → Integrations",
    resolution: "settings.google_review_url → tenant_integrations.settings.google_review_url",
  },
  renewal_form_url: {
    id: "renewal_form_url",
    label: "Rebooking form URL",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.tally.renewal_form_url",
  },
  new_booking_url: {
    id: "new_booking_url",
    label: "New booking form URL",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.tally.new_booking_url",
  },
  cert_prefix: {
    id: "cert_prefix",
    label: "Job / cert reference prefix",
    editedIn: "Settings → Quote & Invoice Defaults",
    resolution: "settings.cert_prefix (falls back to a generic 'Job XXXXXX' label)",
  },
  whatsapp_api_key_secret: {
    id: "whatsapp_api_key_secret",
    label: "360Messenger secret name",
    editedIn: "Customer Integrations → WhatsApp / 360Messenger",
    resolution: "tenant_integrations.360messenger.api_key_secret",
  },
  stripe_payment_link: {
    id: "stripe_payment_link",
    label: "Stripe payment link",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.stripe.payment_link → payment_link_url",
  },
  sumup_merchant_code: {
    id: "sumup_merchant_code",
    label: "SumUp merchant code",
    editedIn: "Customer Integrations → SumUp",
    resolution: "tenant_integrations.sumup.merchant_code (no shared fallback)",
  },
};

// ---------------------------------------------------------------------------
// Catalogue entries — derived from the canonical shared catalogue
// ---------------------------------------------------------------------------

/** What happens at runtime when a required config field is blank. */
export type MissingBehaviour = "skip" | "degrade";

export type TriggerKind = "user action" | "cron" | "webhook" | "inbound";

export interface RequiredField {
  key: ConfigKeyId;
  behaviour: MissingBehaviour;
}

export interface MessageTypeDef {
  id: string;
  name: string;
  purpose: string;
  category: string;
  trigger: TriggerKind;
  /** Directory name under supabase/functions/. */
  fn: string;
  /** Literal `message_log.message_type` value written by the function. */
  messageType?: string;
  /** True when the message_type is built at runtime (e.g. day-suffixed). */
  dynamicMessageType?: boolean;
  requires: RequiredField[];
  /** Wording structure with {{config}} tokens, rendered from the real builder. */
  template: string;
  /** Straight through from the canonical entry, for drill-down in the Admin panel. */
  canonical: CatalogueEntry;
}

/**
 * Maps a canonical config dependency (`table.column` form) onto the
 * admin-facing config key the Settings screens actually expose. Anything that
 * has no admin-editable equivalent — API keys, SumUp credentials — resolves to
 * null and is therefore not shown as a missing field the user can fix here.
 */
function toConfigKey(canonicalKey: string): ConfigKeyId | null {
  const k = canonicalKey.toLowerCase();
  if (k.includes("message_footer")) return "message_footer";
  if (k.includes("renewal_form_url")) return "renewal_form_url";
  if (k.includes("new_booking_url")) return "new_booking_url";
  if (k.includes("google_review_url")) return "google_review_url";
  if (k.includes("cert_prefix")) return "cert_prefix";
  if (k.includes("payment_link")) return "stripe_payment_link";
  if (k.includes("api_key")) return "whatsapp_api_key_secret";
  if (k.includes("sumup")) return "sumup_merchant_code";
  if (k.includes("phone")) return "company_phone";
  if (k.includes("name")) return "company_name";
  return null;
}

/**
 * Maps a canonical template variable onto the config token the preview
 * substitutes. Variables that are job/customer data keep their own name as a
 * `{{data}}`-style placeholder, which `renderPreview` leaves untouched.
 */
function variableToken(source: string, name: string): string {
  const key = toConfigKey(source);
  const looksLikeConfig =
    /settings\.|tenant_integrations|orgBranding/.test(source) && key !== null;
  return looksLikeConfig ? `{{${key}}}` : `{{${name}}}`;
}

const TRIGGER_FALLBACK: TriggerKind = "user action";

/** Reply kind used when previewing the inbound auto-reply family. */
const PREVIEW_REPLY_KIND = "confirm";

function buildTemplate(entry: CatalogueEntry): string {
  if (!entry.build) {
    return `(no in-repo body — sent by ${entry.bodyOwner ?? "an external system"})`;
  }
  const vars: Record<string, unknown> = {};
  for (const v of entry.variables) vars[v.name] = variableToken(v.source, v.name);
  if (entry.key === "inbound_reply") vars.replyKind = PREVIEW_REPLY_KIND;
  if (entry.key === "part_arrived") vars.customMessage = "";
  try {
    return entry.build(vars);
  } catch {
    return "(preview unavailable)";
  }
}

function toRequiredFields(entry: CatalogueEntry): RequiredField[] {
  const out: RequiredField[] = [];
  const seen = new Set<ConfigKeyId>();
  for (const dep of entry.config) {
    const key = toConfigKey(dep.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, behaviour: dep.behaviour });
  }
  return out;
}

export function toMessageTypeDef(entry: CatalogueEntry): MessageTypeDef {
  return {
    id: entry.key,
    name: entry.name,
    purpose: entry.purpose,
    category: entry.category,
    trigger: (entry.trigger as TriggerKind) || TRIGGER_FALLBACK,
    fn: entry.functions.find((f) => !f.startsWith("_shared/")) || entry.functions[0],
    messageType: entry.messageTypes[0],
    dynamicMessageType: entry.dynamicMessageType,
    requires: toRequiredFields(entry),
    template: buildTemplate(entry),
    canonical: entry,
  };
}

export const WHATSAPP_CATALOGUE: MessageTypeDef[] =
  CANONICAL_CATALOGUE.map(toMessageTypeDef);

// ---------------------------------------------------------------------------
// Live tenant config resolution
// ---------------------------------------------------------------------------

export interface SettingsRow {
  business_name?: string | null;
  company_name?: string | null;
  business_phone?: string | null;
  company_phone?: string | null;
  message_footer?: string | null;
  google_review_url?: string | null;
  cert_prefix?: string | null;
}

export interface IntegrationRow {
  integration_type: string;
  config: Record<string, unknown> | null;
}

export interface ResolvedValue {
  key: ConfigKeyId;
  value: string;
  /** Which field actually supplied the value; empty when unresolved. */
  source: string;
  configured: boolean;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Pick the first non-blank candidate, returning both value and its source label. */
function firstOf(candidates: Array<[string, unknown]>): { value: string; source: string } {
  for (const [source, raw] of candidates) {
    const v = str(raw);
    if (v) return { value: v, source };
  }
  return { value: "", source: "" };
}

export function resolveTenantConfig(
  settings: SettingsRow | null,
  integrations: IntegrationRow[],
): Record<ConfigKeyId, ResolvedValue> {
  const s = settings || {};
  const rows = integrations || [];
  const cfg = (type: string): Record<string, unknown> => {
    const row = rows.find((r) => r.integration_type === type);
    return (row?.config as Record<string, unknown>) || {};
  };
  const tally = cfg("tally");
  const stripe = cfg("stripe");
  const sumup = cfg("sumup");
  const messenger = cfg("360messenger");
  const settingsIntegration = cfg("settings");

  const picks: Record<ConfigKeyId, { value: string; source: string }> = {
    company_name: firstOf([
      ["settings.business_name", s.business_name],
      ["settings.company_name", s.company_name],
      ["tenant_integrations.360messenger.company_name", messenger.company_name],
    ]),
    company_phone: firstOf([
      ["settings.business_phone", s.business_phone],
      ["settings.company_phone", s.company_phone],
      ["tenant_integrations.360messenger.company_phone", messenger.company_phone],
    ]),
    message_footer: firstOf([
      ["settings.message_footer", s.message_footer],
      ["settings.business_name", s.business_name],
      ["settings.company_name", s.company_name],
    ]),
    google_review_url: firstOf([
      ["settings.google_review_url", s.google_review_url],
      ["tenant_integrations.settings.google_review_url", settingsIntegration.google_review_url],
    ]),
    renewal_form_url: firstOf([
      ["tenant_integrations.tally.renewal_form_url", tally.renewal_form_url],
    ]),
    new_booking_url: firstOf([
      ["tenant_integrations.tally.new_booking_url", tally.new_booking_url],
    ]),
    cert_prefix: firstOf([["settings.cert_prefix", s.cert_prefix]]),
    whatsapp_api_key_secret: firstOf([
      ["tenant_integrations.360messenger.api_key_secret", messenger.api_key_secret],
    ]),
    stripe_payment_link: firstOf([
      ["tenant_integrations.stripe.payment_link", stripe.payment_link],
      ["tenant_integrations.stripe.payment_link_url", stripe.payment_link_url],
    ]),
    sumup_merchant_code: firstOf([
      ["tenant_integrations.sumup.merchant_code", sumup.merchant_code],
    ]),
  };

  const out = {} as Record<ConfigKeyId, ResolvedValue>;
  for (const key of Object.keys(picks) as ConfigKeyId[]) {
    const p = picks[key];
    out[key] = { key, value: p.value, source: p.source, configured: p.value.length > 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status derivation + preview
// ---------------------------------------------------------------------------

export type MessageStatus = "ready" | "degrade" | "skip";

export interface MessageStatusResult {
  status: MessageStatus;
  missingSkip: ConfigKeyId[];
  missingDegrade: ConfigKeyId[];
}

export function deriveMessageStatus(
  def: MessageTypeDef,
  resolved: Record<ConfigKeyId, ResolvedValue>,
): MessageStatusResult {
  const missingSkip: ConfigKeyId[] = [];
  const missingDegrade: ConfigKeyId[] = [];
  for (const req of def.requires) {
    if (resolved[req.key]?.configured) continue;
    if (req.behaviour === "skip") missingSkip.push(req.key);
    else missingDegrade.push(req.key);
  }
  const status: MessageStatus =
    missingSkip.length > 0 ? "skip" : missingDegrade.length > 0 ? "degrade" : "ready";
  return { status, missingSkip, missingDegrade };
}

export const STATUS_LABEL: Record<MessageStatus, string> = {
  ready: "Ready",
  degrade: "Will degrade",
  skip: "Will skip",
};

/**
 * Display-only preview. Substitutes resolved config tokens into the abridged
 * template. Never sends anything.
 */
export function renderPreview(
  def: MessageTypeDef,
  resolved: Record<ConfigKeyId, ResolvedValue>,
): string {
  const status = deriveMessageStatus(def, resolved);
  let body = def.template;
  for (const key of Object.keys(CONFIG_KEYS) as ConfigKeyId[]) {
    const token = `{{${key}}}`;
    if (!body.includes(token)) continue;
    const r = resolved[key];
    if (r?.configured) {
      body = body.split(token).join(r.value);
    } else if (status.missingDegrade.includes(key)) {
      // Degrade path: at runtime the line carrying the token is omitted.
      body = body
        .split("\n")
        .filter((line) => !line.includes(token))
        .join("\n");
    } else {
      body = body.split(token).join(`[${CONFIG_KEYS[key].label} not configured]`);
    }
  }
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

export const CATALOGUE_CATEGORIES = Array.from(
  new Set(WHATSAPP_CATALOGUE.map((m) => m.category)),
);
