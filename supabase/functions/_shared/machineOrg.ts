// Bind a machine/webhook caller to exactly ONE organisation, server-side.
//
// The gap this closes: a single shared secret proves *who* called, not *which
// tenant they may act for*. Functions that accepted `organisation_id` /
// `org_slug` from the body let any holder of the shared secret act as any
// tenant.
//
// Resolution order (first deterministic match wins, ambiguity always denies):
//   1. Per-tenant secret  — the presented secret matches a tenant integration's
//      own `webhook_secret` / `shared_secret`, or the env var named by
//      `webhook_secret_name`. (Option A)
//   2. Trusted integration identifier — an upstream-provided id (Tally form id,
//      360Messenger account/number, provider account id) matched against the
//      tenant's integration config. (Option B)
//   3. Fully-trusted internal caller (service-role key) may name an
//      organisation explicitly; the org must exist. (Option C, narrow)
//
// A body-supplied organisation_id is NEVER authorization on its own: it is only
// accepted when it equals the server-derived org, or when the caller presented a
// service-role credential.

import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken, hasSharedSecret, isServiceRoleToken } from "./machineAuth.ts";
import {
  type IntegrationIdentifier,
  type IntegrationRow,
  matchIntegrations,
} from "./integrationMatch.ts";

export type MachineOrgResolution =
  | { ok: true; orgId: string; via: "tenant_secret" | "integration_identifier" | "service_role" }
  | {
    ok: false;
    status: number;
    reason:
      | "unauthenticated"
      | "unresolved_organisation"
      | "ambiguous_organisation"
      | "org_mismatch"
      | "unknown_organisation";
  };

export type { IntegrationRow, IntegrationIdentifier } from "./integrationMatch.ts";
export { matchIntegrations } from "./integrationMatch.ts";

export async function resolveMachineOrganisation(
  req: Request,
  opts: {
    fnName: string;
    /** tenant_integrations.integration_type values to search, e.g. ["tally"]. */
    integrationTypes: string[];
    identifier?: IntegrationIdentifier;
    claimedOrgId?: string | null;
  },
): Promise<MachineOrgResolution> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const providedSecret = (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();

  const serviceRole = await isServiceRoleToken(bearerToken(req));
  if (!serviceRole && !providedSecret && !hasSharedSecret(req)) {
    console.warn(`${opts.fnName}: machine org resolution rejected — no credentials`);
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  const { data } = await supabase
    .from("tenant_integrations")
    .select("organisation_id, integration_type, config")
    .in("integration_type", opts.integrationTypes);
  const rows = (data ?? []) as IntegrationRow[];

  const { bySecret, byIdentifier } = matchIntegrations(rows, {
    providedSecret,
    secretEnv: (name) => Deno.env.get(name) ?? undefined,
    identifier: opts.identifier,
  });

  const claimed = String(opts.claimedOrgId ?? "").trim();

  const decide = (
    orgs: string[],
    via: "tenant_secret" | "integration_identifier",
  ): MachineOrgResolution | null => {
    if (orgs.length === 0) return null;
    if (orgs.length > 1) {
      console.warn(`${opts.fnName}: ambiguous organisation (${orgs.length} integration matches)`);
      return { ok: false, status: 409, reason: "ambiguous_organisation" };
    }
    if (claimed && claimed !== orgs[0]) {
      console.warn(`${opts.fnName}: rejected tenant claim that differs from server-derived org`);
      return { ok: false, status: 403, reason: "org_mismatch" };
    }
    return { ok: true, orgId: orgs[0], via };
  };

  const bySecretDecision = decide(bySecret, "tenant_secret");
  if (bySecretDecision) return bySecretDecision;

  const byIdDecision = decide(byIdentifier, "integration_identifier");
  if (byIdDecision) return byIdDecision;

  if (serviceRole && claimed) {
    const { data: org } = await supabase
      .from("organisations")
      .select("id")
      .eq("id", claimed)
      .maybeSingle();
    if (!org?.id) return { ok: false, status: 404, reason: "unknown_organisation" };
    return { ok: true, orgId: claimed, via: "service_role" };
  }

  console.warn(
    `${opts.fnName}: could not resolve organisation from integration identity ` +
      `(secret_match=${bySecret.length} identifier_match=${byIdentifier.length})`,
  );
  return { ok: false, status: 403, reason: "unresolved_organisation" };
}

export function machineOrgDenial(
  r: Extract<MachineOrgResolution, { ok: false }>,
  cors: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: r.reason === "unauthenticated" ? "Unauthorized" : "Forbidden", reason: r.reason }),
    { status: r.status, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

/**
 * Is strict machine→tenant binding enforced?
 *
 * Every live tenant must have its own integration secret (or a resolvable
 * integration identifier) before this is switched on; until then unresolved
 * machine callers keep working but are logged loudly. Flip
 * `STRICT_MACHINE_ORG_BINDING=true` to make unresolved callers fail closed.
 */
export function strictMachineBinding(): boolean {
  return String(Deno.env.get("STRICT_MACHINE_ORG_BINDING") ?? "").trim().toLowerCase() === "true";
}

/**
 * Resolve the tenant for a machine caller, tolerating the transition period.
 *
 * - Resolved deterministically -> { orgId, via, strict: true }
 * - Tenant claim mismatch / ambiguity / unauthenticated -> denial Response
 * - Unresolvable AND strict mode off -> falls back to the (verified-to-exist)
 *   claimed organisation and records `via: "unbound_claim"` so the residual risk
 *   is visible in logs and responses.
 */
export async function bindMachineOrganisation(
  req: Request,
  opts: {
    fnName: string;
    integrationTypes: string[];
    identifier?: IntegrationIdentifier;
    claimedOrgId?: string | null;
    cors: Record<string, string>;
  },
): Promise<
  | { ok: true; orgId: string; via: string }
  | { ok: false; response: Response }
> {
  const resolved = await resolveMachineOrganisation(req, opts);
  if (resolved.ok) return { ok: true, orgId: resolved.orgId, via: resolved.via };

  const failure = resolved;
  const recoverable = failure.reason === "unresolved_organisation";
  const claimed = String(opts.claimedOrgId ?? "").trim();

  if (!recoverable || strictMachineBinding() || !claimed) {
    return { ok: false, response: machineOrgDenial(failure, opts.cors) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("id", claimed)
    .maybeSingle();
  if (!org?.id) {
    return {
      ok: false,
      response: machineOrgDenial({ ok: false, status: 404, reason: "unknown_organisation" }, opts.cors),
    };
  }

  console.warn(
    `${opts.fnName}: accepting body-supplied organisation_id ${claimed} — no per-tenant ` +
      `integration secret/identifier configured. Provision one and set ` +
      `STRICT_MACHINE_ORG_BINDING=true to close this.`,
  );
  return { ok: true, orgId: claimed, via: "unbound_claim" };
}
