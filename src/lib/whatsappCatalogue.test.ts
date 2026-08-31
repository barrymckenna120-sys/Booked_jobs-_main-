import { describe, expect, it } from "vitest";
import {
  CANONICAL_CATALOGUE,
  CONFIG_KEYS,
  WHATSAPP_CATALOGUE,
  deriveMessageStatus,
  renderPreview,
  resolveTenantConfig,
  type ConfigKeyId,
} from "./whatsappCatalogue";
import { TENANT_GAP_COPY } from "./messageStatusCopy";

// Edge Function sources, read at test time via Vite's raw glob (no node typings needed).
const FUNCTION_SOURCES = import.meta.glob("/supabase/functions/*/index.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Shared modules that some entries send/log from.
const SHARED_SOURCES = import.meta.glob("/supabase/functions/_shared/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sourceFor = (fn: string): string | undefined =>
  FUNCTION_SOURCES[`/supabase/functions/${fn}/index.ts`];


describe("whatsappCatalogue — drift detection", () => {
  it("has unique ids", () => {
    const ids = WHATSAPP_CATALOGUE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("loaded the Edge Function sources", () => {
    expect(Object.keys(FUNCTION_SOURCES).length).toBeGreaterThan(20);
  });

  it("points every entry at an Edge Function that exists", () => {
    const missing = WHATSAPP_CATALOGUE.filter((m) => !sourceFor(m.fn)).map(
      (m) => `${m.id} -> ${m.fn}`,
    );
    expect(missing).toEqual([]);
  });

  it("declares message_type values that the function actually writes", () => {
    const mismatched: string[] = [];
    for (const m of WHATSAPP_CATALOGUE) {
      if (!m.messageType) continue;
      // Some entries write their message_log row from a shared module rather
      // than the function's own index.ts (e.g. deposit_link -> _shared/depositLink.ts),
      // so search every source the canonical entry claims.
      const sources = m.canonical.functions
        .map((fn) => (fn.startsWith("_shared/") ? SHARED_SOURCES[`/supabase/functions/${fn}`] : sourceFor(fn)))
        .filter(Boolean) as string[];
      const found = sources.some(
        (src) => src.includes(`"${m.messageType}"`) || src.includes(`'${m.messageType}'`),
      );
      if (!found) {
        mismatched.push(`${m.id}: "${m.messageType}" not found in ${m.canonical.functions.join(", ")}`);
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
  const renewal = WHATSAPP_CATALOGUE.find((m) => m.id === "renewal_reminder")!;
  // reschedule_notification is a genuine skip: send-reschedule-notification
  // aborts with message_footer_not_configured when the footer is blank.
  const reschedule = WHATSAPP_CATALOGUE.find((m) => m.id === "reschedule_notification")!;

  it("skips when a skip-required key is blank", () => {
    const r = resolveTenantConfig({}, []);
    const s = deriveMessageStatus(reschedule, r);
    expect(s.status).toBe("skip");
    expect(s.missingSkip).toContain("message_footer");
  });

  it("degrades rather than skips when the renewal booking link is absent", () => {
    // Verified against send-renewal-reminder/index.ts: a missing Tally URL only
    // swaps the booking line for reply/call wording — the message still sends.
    const r = resolveTenantConfig({ business_name: "Acme", business_phone: "087 000 0000" }, []);
    const s = deriveMessageStatus(renewal, r);
    expect(s.status).toBe("degrade");
    expect(s.missingSkip).toEqual([]);
    expect(s.missingDegrade).toContain("renewal_form_url");
  });

  it("degrades when only degrade-required keys are blank", () => {
    const r = resolveTenantConfig({}, [
      { integration_type: "tally", config: { renewal_form_url: "https://x.example" } },
    ]);
    const s = deriveMessageStatus(renewal, r);
    expect(s.status).toBe("degrade");
    expect(s.missingDegrade).toEqual(expect.arrayContaining(["company_name", "company_phone"]));
  });

  it("is ready when everything resolves", () => {
    const r = resolveTenantConfig({ business_name: "Acme", business_phone: "087 000 0000" }, [
      { integration_type: "tally", config: { renewal_form_url: "https://x.example" } },
    ]);
    expect(deriveMessageStatus(renewal, r).status).toBe("ready");
  });
});

describe("renderPreview", () => {
  it("substitutes resolved values and flags unconfigured skip keys", () => {
    const def = WHATSAPP_CATALOGUE.find((m) => m.id === "certificate")!;
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

describe("canonical mirror", () => {
  const CANONICAL = import.meta.glob("/supabase/functions/_shared/whatsappCatalogue.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const MIRROR = import.meta.glob("/src/lib/whatsappCatalogue.generated.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("has not drifted from the canonical shared catalogue", () => {
    const canonical = CANONICAL["/supabase/functions/_shared/whatsappCatalogue.ts"];
    const mirror = MIRROR["/src/lib/whatsappCatalogue.generated.ts"];
    expect(canonical).toBeTruthy();
    expect(mirror).toBeTruthy();
    // The mirror is a banner + byte copy. Re-run scripts/generate-whatsapp-catalogue.mjs.
    expect(mirror.endsWith(canonical)).toBe(true);
    expect(mirror).toContain("AUTO-GENERATED FILE — DO NOT EDIT.");
  });

  it("derives every canonical entry into the frontend catalogue", () => {
    expect(WHATSAPP_CATALOGUE.length).toBe(CANONICAL_CATALOGUE.length);
    for (const def of WHATSAPP_CATALOGUE) {
      expect(def.name).toBeTruthy();
      expect(def.purpose).toBeTruthy();
      expect(def.fn).toBeTruthy();
      expect(def.template.length).toBeGreaterThan(0);
    }
  });
});
