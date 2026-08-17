import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFIG_KEYS,
  WHATSAPP_CATALOGUE,
  deriveMessageStatus,
  renderPreview,
  resolveTenantConfig,
  type ConfigKeyId,
} from "./whatsappCatalogue";
import { TENANT_GAP_COPY } from "./messageStatusCopy";

const FUNCTIONS_DIR = join(process.cwd(), "supabase", "functions");

describe("whatsappCatalogue — drift detection", () => {
  it("has unique ids", () => {
    const ids = WHATSAPP_CATALOGUE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every entry at an Edge Function that exists", () => {
    const missing = WHATSAPP_CATALOGUE.filter(
      (m) => !existsSync(join(FUNCTIONS_DIR, m.fn, "index.ts")),
    ).map((m) => `${m.id} -> ${m.fn}`);
    expect(missing).toEqual([]);
  });

  it("declares message_type values that the function actually writes", () => {
    const mismatched: string[] = [];
    for (const m of WHATSAPP_CATALOGUE) {
      if (!m.messageType) continue;
      const src = readFileSync(join(FUNCTIONS_DIR, m.fn, "index.ts"), "utf8");
      if (!src.includes(`"${m.messageType}"`) && !src.includes(`'${m.messageType}'`)) {
        mismatched.push(`${m.id}: "${m.messageType}" not found in ${m.fn}/index.ts`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("only references known config keys, and every template token is a known key", () => {
    const known = new Set(Object.keys(CONFIG_KEYS));
    for (const m of WHATSAPP_CATALOGUE) {
      for (const r of m.requires) expect(known.has(r.key)).toBe(true);
    }
  });

  it("has tenant-facing copy for every config key", () => {
    for (const key of Object.keys(CONFIG_KEYS) as ConfigKeyId[]) {
      expect(TENANT_GAP_COPY[key]).toBeTruthy();
      // No internal reason codes leaking into tenant copy.
      expect(TENANT_GAP_COPY[key].pausedLine).not.toMatch(/_not_configured|message_footer|snake_case/);
    }
  });
});

describe("resolveTenantConfig", () => {
  it("follows the footer fallback chain", () => {
    const r = resolveTenantConfig({ business_name: "Acme Gas" }, []);
    expect(r.message_footer.value).toBe("Acme Gas");
    expect(r.message_footer.source).toBe("settings.business_name");
    expect(r.message_footer.configured).toBe(true);
  });

  it("treats blank strings as unconfigured", () => {
    const r = resolveTenantConfig({ message_footer: "   ", google_review_url: "" }, [
      { integration_type: "tally", config: { renewal_form_url: "" } },
    ]);
    expect(r.message_footer.configured).toBe(false);
    expect(r.google_review_url.configured).toBe(false);
    expect(r.renewal_form_url.configured).toBe(false);
  });

  it("reads integration-backed keys", () => {
    const r = resolveTenantConfig({}, [
      { integration_type: "tally", config: { renewal_form_url: "https://rebook.example" } },
      { integration_type: "sumup", config: { merchant_code: "ABC123" } },
    ]);
    expect(r.renewal_form_url.value).toBe("https://rebook.example");
    expect(r.sumup_merchant_code.value).toBe("ABC123");
  });
});

describe("deriveMessageStatus", () => {
  const def = WHATSAPP_CATALOGUE.find((m) => m.id === "renewal_reminder")!;

  it("skips when a skip-required key is blank", () => {
    const r = resolveTenantConfig({ business_name: "Acme" }, []);
    const s = deriveMessageStatus(def, r);
    expect(s.status).toBe("skip");
    expect(s.missingSkip).toContain("renewal_form_url");
  });

  it("degrades when only degrade-required keys are blank", () => {
    const r = resolveTenantConfig({}, [
      { integration_type: "tally", config: { renewal_form_url: "https://x.example" } },
    ]);
    const s = deriveMessageStatus(def, r);
    expect(s.status).toBe("degrade");
    expect(s.missingDegrade).toEqual(expect.arrayContaining(["company_name", "company_phone"]));
  });

  it("is ready when everything resolves", () => {
    const r = resolveTenantConfig({ business_name: "Acme", business_phone: "087 000 0000" }, [
      { integration_type: "tally", config: { renewal_form_url: "https://x.example" } },
    ]);
    expect(deriveMessageStatus(def, r).status).toBe("ready");
  });
});

describe("renderPreview", () => {
  it("substitutes resolved values and flags unconfigured skip keys", () => {
    const def = WHATSAPP_CATALOGUE.find((m) => m.id === "quote_sent")!;
    expect(renderPreview(def, resolveTenantConfig({ business_name: "Acme" }, []))).toContain("Acme");
    expect(renderPreview(def, resolveTenantConfig({}, []))).toContain("not configured");
  });

  it("omits the line carrying a degraded token", () => {
    const def = WHATSAPP_CATALOGUE.find((m) => m.id === "part_arrived")!;
    const body = renderPreview(def, resolveTenantConfig({}, []));
    expect(body).not.toContain("{{message_footer}}");
    expect(body).toContain("has arrived");
  });
});
