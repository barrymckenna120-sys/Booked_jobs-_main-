// Pure helpers for the post-payment "warranty welcome" WhatsApp.
// No I/O — unit tested in warrantyWelcome.test.ts.

export type InstallJobCandidate = { job_type?: string | null } | null | undefined;

const INSTALL_PATTERNS = ["install", "replace", "new boiler"];
const INSTALL_TAG = "new boiler fitted";

/** Install/replacement job, by job type or the "New Boiler Fitted" tag. */
export function isInstallJob(job: InstallJobCandidate, tagNames: Array<string | null | undefined> = []): boolean {
  const jt = String(job?.job_type ?? "").toLowerCase();
  if (INSTALL_PATTERNS.some((p) => jt.includes(p))) return true;
  return tagNames.some((t) => String(t ?? "").trim().toLowerCase() === INSTALL_TAG);
}

export type WarrantyWelcomeInput = {
  firstName?: string | null;
  tenantName: string;
  brand?: string | null;
  model?: string | null;
  warrantyYears?: number | null;
  tenantPhone?: string | null;
  footer?: string | null;
};

const clean = (v: unknown) => String(v ?? "").trim();

export function firstNameOf(fullName: string | null | undefined): string {
  return clean(fullName).split(/\s+/)[0] || "";
}

export function buildWarrantyWelcome(i: WarrantyWelcomeInput): string {
  const first = clean(i.firstName);
  const brand = clean(i.brand);
  const model = clean(i.model);
  const boiler = brand && model ? `${brand} ${model} boiler` : brand ? `${brand} boiler` : "boiler";
  const n = Number(i.warrantyYears);
  const clause = Number.isFinite(n) && n > 0 ? ` and covered by a ${n}-year manufacturer's warranty` : "";
  const phone = clean(i.tenantPhone);
  const footer = clean(i.footer);

  const lines = [
    `Hi${first ? ` ${first}` : ""}, thanks for choosing ${clean(i.tenantName)}.`,
    `Your new ${boiler} is now fitted${clause}.`,
    "To keep your warranty valid, your boiler needs to be serviced once a year by a Registered Gas Installer (RGII). We'll remind you when your first service is due.",
  ];
  if (phone) lines.push(`Any questions, call us on ${phone}.`);
  if (footer) lines.push(footer);
  return lines.join("\n");
}

export type BoilerBrandRow = {
  brand_name: string;
  model_name: string | null;
  warranty_years: number | null;
  is_default: boolean | null;
};

/** Same matching order as WarrantyDetail.tsx (model row, then brand default) — no fallback value. */
export function lookupWarrantyYears(makeModel: string, brands: BoilerBrandRow[]): number | null {
  const mm = clean(makeModel).toLowerCase();
  if (!mm) return null;
  for (const row of brands.filter((b) => !b.is_default && b.model_name)) {
    if (mm.includes(`${row.brand_name} ${row.model_name}`.toLowerCase())) return row.warranty_years ?? null;
  }
  const defaults = brands.filter((b) => b.is_default).sort((a, b) => b.brand_name.length - a.brand_name.length);
  for (const row of defaults) {
    if (mm.includes(row.brand_name.toLowerCase())) return row.warranty_years ?? null;
  }
  return null;
}
