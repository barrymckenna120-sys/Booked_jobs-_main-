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
 *     environment: "live" | "test",   // active mode; absent means "live"
 *     environments: {                 // per-mode credential archive
 *       live: { merchant_code, api_key_secret },
 *       test: { merchant_code, api_key_secret },
 *     }
 *   }
 *
 * Mode safety (BJ-next-E): when `environment` is anything other than "live",
 * credentials are resolved ONLY from `environments[environment]`. An
 * incomplete sandbox/test entry is a hard failure — the resolver NEVER falls
 * back to the live pair, so a half-configured sandbox mode cannot silently
 * charge a real card.
 */

export interface SumUpCredentials {
  apiKey: string;
  merchantCode: string;
}

export interface SumUpCredentialsResult {
  ok: boolean;
  credentials?: SumUpCredentials;
  /** The mode the credentials were resolved for ("live" when unspecified). */
  environment?: string;
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

interface EnvPair {
  merchantCode: string;
  inlineKey: string;
  secretName: string;
}

function readPair(source: unknown): EnvPair {
  const cfg = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  return {
    merchantCode: typeof cfg.merchant_code === "string" ? cfg.merchant_code.trim() : "",
    inlineKey: typeof cfg.api_key === "string" ? cfg.api_key.trim() : "",
    secretName: typeof cfg.api_key_secret === "string" ? cfg.api_key_secret.trim() : "",
  };
}

/**
 * Resolves the SumUp credentials for one organisation.
 * Never throws and never falls back to project-wide credentials — and in
 * sandbox/test mode never falls back to that org's live pair either.
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

  const rawEnv = typeof config.environment === "string"
    ? config.environment.trim().toLowerCase()
    : "";
  // Absent or unknown labels default to live (sandbox is always explicit
  // opt-in); "sandbox" is accepted as an alias of "test".
  const environment = rawEnv === "test" || rawEnv === "sandbox" ? "test" : "live";

  let pair: EnvPair;
  if (environment === "live") {
    pair = readPair(config);
  } else {
    const envs = config.environments;
    const entry =
      envs && typeof envs === "object"
        ? (envs as Record<string, unknown>)[environment] ??
          (envs as Record<string, unknown>)["sandbox"]
        : undefined;
    pair = readPair(entry);
    // Hard fail on ANY incompleteness — never read the live pair here.
    if (!pair.merchantCode || (!pair.inlineKey && !pair.secretName)) {
      return { ok: false, environment, error: "sumup_sandbox_config_incomplete" };
    }
  }

  const envKey = pair.secretName ? (getEnv(pair.secretName) ?? "").trim() : "";
  const apiKey = pair.inlineKey || envKey;

  if (!pair.merchantCode) {
    return { ok: false, environment, error: "sumup_config_missing_merchant_code" };
  }
  if (!apiKey) {
    const error = environment === "live"
      ? "sumup_config_missing_api_key"
      : "sumup_sandbox_config_incomplete";
    return { ok: false, environment, error };
  }

  return { ok: true, environment, credentials: { apiKey, merchantCode: pair.merchantCode } };
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
