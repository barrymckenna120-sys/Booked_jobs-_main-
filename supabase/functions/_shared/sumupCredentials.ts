/**
 * Per-organisation SumUp credential resolution.
 *
 * Money path: every SumUp checkout MUST be created with the credentials of the
 * organisation that owns the job/invoice. There is deliberately NO global
 * fallback — routing one tenant's customer payment into another tenant's SumUp
 * account would be a serious incident, so a missing config is a hard failure.
 *
 * Storage shape — tenant_integrations row:
 *   organisation_id  = <org uuid>
 *   integration_type = 'sumup'
 *   config = {
 *     merchant_code: "MBBMEYG7",
 *     api_key: "sup_sk_...",          // either inline...
 *     api_key_secret: "SUMUP_API_KEY" // ...or the name of an env secret
 *   }
 */

export interface SumUpCredentials {
  apiKey: string;
  merchantCode: string;
}

export interface SumUpCredentialsResult {
  ok: boolean;
  credentials?: SumUpCredentials;
  /** Machine-readable reason; safe to log (never contains the key itself). */
  error?: string;
}

export interface ResolveSumUpArgs {
  organisationId: string | null | undefined;
  /** Fetches the tenant_integrations config for (org, 'sumup'). */
  loadConfig: (organisationId: string) => Promise<Record<string, unknown> | null>;
  /** Env reader, injectable for tests. Defaults to Deno.env.get. */
  getEnv?: (name: string) => string | undefined;
}

/**
 * Resolves the SumUp credentials for one organisation.
 * Never throws and never falls back to project-wide credentials.
 */
export async function resolveSumUpCredentials(
  args: ResolveSumUpArgs,
): Promise<SumUpCredentialsResult> {
  const { organisationId, loadConfig } = args;
  const getEnv = args.getEnv ?? ((n: string) => Deno.env.get(n));

  if (!organisationId) {
    return { ok: false, error: "missing_organisation_id" };
  }

  let config: Record<string, unknown> | null;
  try {
    config = await loadConfig(organisationId);
  } catch (_e) {
    return { ok: false, error: `sumup_config_lookup_failed: ${(_e as Error).message}` };
  }

  if (!config) {
    return { ok: false, error: "no_sumup_config_for_organisation" };
  }

  const merchantCode = typeof config.merchant_code === "string" ? config.merchant_code.trim() : "";

  const inlineKey = typeof config.api_key === "string" ? config.api_key.trim() : "";
  const secretName =
    typeof config.api_key_secret === "string" ? config.api_key_secret.trim() : "";
  const envKey = secretName ? (getEnv(secretName) ?? "").trim() : "";
  const apiKey = inlineKey || envKey;

  if (!merchantCode) {
    return { ok: false, error: "sumup_config_missing_merchant_code" };
  }
  if (!apiKey) {
    return { ok: false, error: "sumup_config_missing_api_key" };
  }

  return { ok: true, credentials: { apiKey, merchantCode } };
}

/**
 * Convenience loader for functions that talk to PostgREST with raw fetch
 * (service-role headers already assembled by the caller).
 */
export function makeRestSumUpConfigLoader(
  supabaseUrl: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
) {
  return async (organisationId: string): Promise<Record<string, unknown> | null> => {
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${organisationId}` +
        `&integration_type=eq.sumup&select=config&limit=1`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    const rows = await res.json();
    const cfg = Array.isArray(rows) ? rows[0]?.config : null;
    return cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : null;
  };
}
