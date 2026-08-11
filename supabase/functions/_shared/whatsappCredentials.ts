/**
 * Single resolver for a tenant's 360Messenger/WhatsApp API key.
 *
 * Tenants store credentials two different ways and on two different
 * integration_type rows:
 *   - config.api_key_secret -> the NAME of an edge-function secret (preferred)
 *   - config.api_key        -> the literal key (older rows)
 *   - integration_type      -> "360messenger" or "whatsapp"
 *
 * Functions that only read `config.api_key` on a `360messenger` row return
 * "WhatsApp integration not configured" for any tenant using the secret-name
 * form (K&N does), so every WhatsApp sender must go through this.
 */

export interface WhatsappIntegrationRow {
  integration_type?: string | null;
  config?: Record<string, unknown> | null;
}

export interface WhatsappKeyResolution {
  apiKey: string | null;
  /** Machine-readable account of how the key was (not) found — for logs. */
  resolution: string;
  /** Set when a secret name was declared, so a missing secret is nameable. */
  secretName: string | null;
  /** Human-readable reason, only meaningful when apiKey is null. */
  detail: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Pure resolution step — no I/O, so it can be unit tested directly. */
export const resolveWhatsappApiKey = (
  rows: WhatsappIntegrationRow[] | null | undefined,
  getEnv: (name: string) => string | undefined = (n) => Deno.env.get(n),
): WhatsappKeyResolution => {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return {
      apiKey: null,
      resolution: "no_integration_row",
      secretName: null,
      detail: "No 360messenger/whatsapp integration row for this organisation",
    };
  }

  // Prefer the dedicated 360messenger row; fall back to whichever row exists.
  const ordered = [
    ...list.filter((r) => r.integration_type === "360messenger"),
    ...list.filter((r) => r.integration_type !== "360messenger"),
  ];

  let firstSecretName: string | null = null;

  for (const row of ordered) {
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const secretName = str(cfg.api_key_secret);
    if (secretName) {
      if (!firstSecretName) firstSecretName = secretName;
      const fromEnv = str(getEnv(secretName));
      if (fromEnv) {
        return {
          apiKey: fromEnv,
          resolution: `secret:${secretName}`,
          secretName,
          detail: "",
        };
      }
    }
    const literal = str(cfg.api_key);
    if (literal) {
      return {
        apiKey: literal,
        resolution: `literal_config:${row.integration_type ?? "unknown"}`,
        secretName: secretName || null,
        detail: "",
      };
    }
  }

  return firstSecretName
    ? {
      apiKey: null,
      resolution: `secret_missing:${firstSecretName}`,
      secretName: firstSecretName,
      detail: `Secret "${firstSecretName}" is not set for this organisation`,
    }
    : {
      apiKey: null,
      resolution: "no_key_in_config",
      secretName: null,
      detail: "Integration row has no api_key or api_key_secret",
    };
};

/** Fetches both candidate integration rows and resolves the key from them. */
export const fetchWhatsappApiKey = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
): Promise<WhatsappKeyResolution> => {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}` +
      `&integration_type=in.(360messenger,whatsapp)&select=integration_type,config`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) {
    return {
      apiKey: null,
      resolution: `lookup_failed:${res.status}`,
      secretName: null,
      detail: `tenant_integrations lookup failed (${res.status})`,
    };
  }
  return resolveWhatsappApiKey(await res.json());
};

/** Same resolution for functions that already hold a supabase-js client. */
export const fetchWhatsappApiKeyWithClient = async (
  client: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          in: (c: string, v: string[]) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  },
  orgId: string,
): Promise<WhatsappKeyResolution> => {
  const { data, error } = await client
    .from("tenant_integrations")
    .select("integration_type,config")
    .eq("organisation_id", orgId)
    .in("integration_type", ["360messenger", "whatsapp"]);
  if (error) {
    return {
      apiKey: null,
      resolution: "lookup_failed",
      secretName: null,
      detail: "tenant_integrations lookup failed",
    };
  }
  return resolveWhatsappApiKey(data as WhatsappIntegrationRow[]);
};
