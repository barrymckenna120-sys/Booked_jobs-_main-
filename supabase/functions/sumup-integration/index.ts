/**
 * Per-tenant SumUp integration management (Settings → Integrations → Payments).
 *
 * Money-path adjacent: this function only reads/writes the tenant's
 * `tenant_integrations` row of type 'sumup' (merchant code + the NAME of the
 * backend secret holding that tenant's SumUp key). The key VALUE is never
 * accepted, stored or returned here — it lives only in the backend secret
 * store, exactly as `_shared/sumupCredentials.ts` expects.
 *
 * Actions (POST body { action }):
 *   status     — current config + whether the referenced secret resolves
 *   save       — upsert merchant_code / api_key_secret (merge, never replace)
 *   test       — read-only GET https://api.sumup.com/v0.1/me (no payment)
 *   whoami     — superadmin-only: resolve the merchant a named secret belongs to
 *   disconnect — delete the tenant's sumup row
 *
 * Isolation: the target organisation is always derived from the caller's JWT.
 * A client-supplied organisation_id is honoured only for superadmins.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { canManageTenantIntegration } from "../_shared/integrationRoles.ts";

const ALLOWED_ORIGINS = [
  "https://kngasservices.bookedjobs.ie",
  "https://dublin-gas.bookedjobs.ie",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".lovableproject.com") || hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin! : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{2,120}$/;
const MERCHANT_CODE_RE = /^[A-Z0-9]{4,20}$/;
type SumUpEnvironment = "test" | "live";
const ENVIRONMENTS: SumUpEnvironment[] = ["test", "live"];

interface SumUpEnvEntry {
  merchant_code?: string;
  api_key_secret?: string;
}

interface SumUpConfig {
  merchant_code?: string;
  api_key_secret?: string;
  /** Active environment label for the top-level pair the resolver reads. */
  environment?: SumUpEnvironment;
  /** Per-environment archive so test and live pairs stay separate. */
  environments?: Partial<Record<SumUpEnvironment, SumUpEnvEntry>>;
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: callerRole }, { data: callerProfile }] = await Promise.all([
      supabaseUser.rpc("get_user_role", { _user_id: caller.id }),
      supabaseAdmin
        .from("profiles")
        .select("role, organisation_id")
        .eq("user_id", caller.id)
        .maybeSingle(),
    ]);

    const profileRole = String((callerProfile as any)?.role ?? "");
    const rpcRole = String(callerRole ?? "");
    if (!canManageTenantIntegration(rpcRole, profileRole)) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const { data: callerEng } = await supabaseAdmin
      .from("engineers")
      .select("organisation_id")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    const isSuperadmin =
      rpcRole === "superadmin" || profileRole === "superadmin";

    const callerOrgId: string | null =
      (callerEng as any)?.organisation_id ?? (callerProfile as any)?.organisation_id ?? null;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) ?? {};
    } catch (_e) {
      body = {};
    }

    let targetOrgId: string | null;
    if (isSuperadmin) {
      const requested = typeof body.organisation_id === "string" ? body.organisation_id : null;
      targetOrgId = requested ?? callerOrgId;
    } else {
      targetOrgId = callerOrgId;
    }
    if (!targetOrgId || !UUID_RE.test(targetOrgId)) {
      return json({ error: "Could not resolve your organisation" }, 400);
    }

    const action = typeof body.action === "string" ? body.action : "status";

    const loadRow = async () => {
      const { data, error } = await supabaseAdmin
        .from("tenant_integrations")
        .select("id, config")
        .eq("organisation_id", targetOrgId)
        .eq("integration_type", "sumup")
        .maybeSingle();
      if (error) throw new Error(`config_lookup_failed: ${error.message}`);
      return data as { id: string; config: SumUpConfig | null } | null;
    };

    /**
     * Shape returned to the client. Secret NAMES only — never a key value.
     * `environments` lets the UI keep the tenant's test and live pairs apart
     * without ever needing to read another tenant's row.
     */
    const describe = (config: SumUpConfig | null) => {
      const merchantCode = typeof config?.merchant_code === "string" ? config.merchant_code.trim() : "";
      const secretName = typeof config?.api_key_secret === "string" ? config.api_key_secret.trim() : "";
      const secretPresent = secretName ? Boolean((Deno.env.get(secretName) ?? "").trim()) : false;
      // Absent/unknown labels default to live — sandbox is explicit opt-in.
      // "sandbox" is accepted as an alias of "test".
      const rawEnvironment = typeof config?.environment === "string"
        ? config.environment.trim().toLowerCase()
        : "";
      const environment: SumUpEnvironment =
        rawEnvironment === "test" || rawEnvironment === "sandbox" ? "test" : "live";

      const environments: Partial<Record<SumUpEnvironment, SumUpEnvEntry>> = {};
      for (const env of ENVIRONMENTS) {
        const entry = (config?.environments as Record<string, SumUpEnvEntry> | undefined)?.[env];
        const code = typeof entry?.merchant_code === "string" ? entry.merchant_code.trim() : "";
        const secret = typeof entry?.api_key_secret === "string" ? entry.api_key_secret.trim() : "";
        if (code || secret) environments[env] = { merchant_code: code, api_key_secret: secret };
      }
      // Back-fill the active environment from the top-level pair for rows saved
      // before environments were tracked.
      if (!environments[environment] && (merchantCode || secretName)) {
        environments[environment] = { merchant_code: merchantCode, api_key_secret: secretName };
      }

      return {
        provider: "sumup",
        merchant_code: merchantCode,
        api_key_secret: secretName,
        environment,
        environments,
        secret_present: secretPresent,
        configured: Boolean(merchantCode && secretPresent),
      };
    };

    if (action === "status") {
      const row = await loadRow();
      return json({ ok: true, organisation_id: targetOrgId, ...describe(row?.config ?? null) });
    }

    if (action === "save") {
      const merchantCode = String(body.merchant_code ?? "").trim().toUpperCase();
      const secretName = String(body.api_key_secret ?? "").trim();
      // Default live — sandbox/test mode is explicit opt-in only.
      const rawEnv = String(body.environment ?? "live").trim().toLowerCase();
      const normalisedEnv = rawEnv === "sandbox" ? "test" : rawEnv;

      if (!ENVIRONMENTS.includes(normalisedEnv as SumUpEnvironment)) {
        return json({ error: "Environment must be either test or live.", field: "environment" }, 400);
      }
      const environment = normalisedEnv as SumUpEnvironment;

      if (!MERCHANT_CODE_RE.test(merchantCode)) {
        return json({
          error: "Merchant Code must be 4–20 letters/digits, e.g. MBBMEYG7.",
          field: "merchant_code",
        }, 400);
      }
      if (!SECRET_NAME_RE.test(secretName)) {
        return json({
          error:
            "API Key Secret Name must be an uppercase secret name (letters, digits, underscores), e.g. SUMUP_API_KEY_ACME_TEST. Never paste the key itself.",
          field: "api_key_secret",
        }, 400);
      }
      if (/^(sup_sk|sup_pk)/i.test(secretName)) {
        return json({
          error: "That looks like a SumUp key, not a secret name. Store the key in Backend → Secrets and enter its NAME here.",
          field: "api_key_secret",
        }, 400);
      }

      const row = await loadRow();
      const existing = (row?.config as SumUpConfig) ?? {};

      // Flipping live <-> test is superadmin-only: it decides whether real
      // cards are charged, so tenant admins cannot switch it themselves.
      const storedEnvRaw = typeof existing.environment === "string"
        ? existing.environment.trim().toLowerCase()
        : "live";
      const storedEnv = storedEnvRaw === "sandbox" ? "test" : storedEnvRaw;
      const storedEnvironment: SumUpEnvironment = storedEnv === "test" ? "test" : "live";
      if (environment !== storedEnvironment && !isSuperadmin) {
        return json({
          error: "Only a Booked Jobs administrator can switch the SumUp environment.",
          field: "environment",
        }, 403);
      }

      const existingEnvs =
        (existing.environments as Record<string, SumUpEnvEntry> | undefined) ?? {};

      const merged: SumUpConfig = {
        ...existing,
        // Active pair — this is what _shared/sumupCredentials.ts reads.
        merchant_code: merchantCode,
        api_key_secret: secretName,
        environment,
        // Keep the other environment's pair intact so switching back is lossless
        // and a test secret can never be silently promoted to live.
        environments: {
          ...existingEnvs,
          [environment]: { merchant_code: merchantCode, api_key_secret: secretName },
        },
      };

      if (row?.id) {
        const { error } = await supabaseAdmin
          .from("tenant_integrations")
          .update({ config: merged })
          .eq("id", row.id)
          .eq("organisation_id", targetOrgId);
        if (error) return json({ error: `Save failed: ${error.message}` }, 500);
      } else {
        const { error } = await supabaseAdmin
          .from("tenant_integrations")
          .insert({ organisation_id: targetOrgId, integration_type: "sumup", config: merged });
        if (error) return json({ error: `Save failed: ${error.message}` }, 500);
      }

      const state = describe(merged);
      return json({
        ok: true,
        organisation_id: targetOrgId,
        ...state,
        warning: state.secret_present
          ? null
          : `Saved, but no backend secret named ${secretName} was found yet. Add it in Backend → Secrets before taking payments.`,
      });
    }

    if (action === "test") {
      const row = await loadRow();
      const state = describe(row?.config ?? null);
      if (!state.merchant_code) {
        return json({ ok: false, status: "error", message: "No Merchant Code saved yet." });
      }
      if (!state.api_key_secret) {
        return json({ ok: false, status: "error", message: "No API Key Secret Name saved yet." });
      }
      const apiKey = (Deno.env.get(state.api_key_secret) ?? "").trim();
      if (!apiKey) {
        return json({
          ok: false,
          status: "error",
          message: `No backend secret named ${state.api_key_secret} is set. Add it in Backend → Secrets.`,
        });
      }

      // Read-only profile fetch — never creates a payment.
      const res = await fetch("https://api.sumup.com/v0.1/me", {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`sumup /me failed [${res.status}]: ${text}`);
        return json({
          ok: false,
          status: "error",
          message: res.status === 401
            ? "SumUp rejected the API key (401). Check the key stored in that secret."
            : `SumUp returned ${res.status}.`,
          details: text.slice(0, 500),
        });
      }

      let profile: any = {};
      try {
        profile = JSON.parse(text);
      } catch (_e) {
        profile = {};
      }
      const liveMerchant: string = String(
        profile?.merchant_profile?.merchant_code ?? "",
      ).trim().toUpperCase();

      if (liveMerchant && liveMerchant !== state.merchant_code) {
        return json({
          ok: false,
          status: "error",
          message: `Key belongs to merchant ${liveMerchant}, but ${state.merchant_code} is saved. Fix the Merchant Code before taking payments.`,
        });
      }

      return json({
        ok: true,
        status: "connected",
        message: `Connected to SumUp${liveMerchant ? ` (merchant ${liveMerchant})` : ""} in ${state.environment} mode.`,
        merchant_code: liveMerchant || state.merchant_code,
        environment: state.environment,
        account_name: profile?.merchant_profile?.company_name ?? null,
        currency: profile?.merchant_profile?.default_currency ?? null,
      });
    }

    if (action === "whoami") {
      // Superadmin-only diagnostic: resolve which SumUp merchant a named
      // backend secret belongs to. Read-only GET /v0.1/me — no payment is
      // created and the key value is never returned.
      if (!isSuperadmin) {
        return json({ error: "Insufficient permissions" }, 403);
      }
      const probeSecret = String(body.api_key_secret ?? "").trim();
      if (!SECRET_NAME_RE.test(probeSecret)) {
        return json({ error: "api_key_secret must be an uppercase secret name.", field: "api_key_secret" }, 400);
      }
      const probeKey = (Deno.env.get(probeSecret) ?? "").trim();
      if (!probeKey) {
        return json({ ok: false, status: "error", message: `No backend secret named ${probeSecret} is set.` });
      }
      const res = await fetch("https://api.sumup.com/v0.1/me", {
        headers: { Authorization: `Bearer ${probeKey}`, Accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`sumup whoami failed [${res.status}]: ${text}`);
        return json({
          ok: false,
          status: "error",
          message: res.status === 401
            ? "SumUp rejected the API key (401)."
            : `SumUp returned ${res.status}.`,
        });
      }
      let profile: any = {};
      try {
        profile = JSON.parse(text);
      } catch (_e) {
        profile = {};
      }
      return json({
        ok: true,
        status: "connected",
        merchant_code: String(profile?.merchant_profile?.merchant_code ?? "").trim().toUpperCase() || null,
        account_name: profile?.merchant_profile?.company_name ?? null,
        currency: profile?.merchant_profile?.default_currency ?? null,
      });
    }

    if (action === "disconnect") {
      const { error } = await supabaseAdmin
        .from("tenant_integrations")
        .delete()
        .eq("organisation_id", targetOrgId)
        .eq("integration_type", "sumup");
      if (error) return json({ error: `Disconnect failed: ${error.message}` }, 500);
      return json({
        ok: true,
        organisation_id: targetOrgId,
        provider: "sumup",
        merchant_code: "",
        api_key_secret: "",
        environment: "live",
        environments: {},
        secret_present: false,
        configured: false,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("sumup-integration error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
