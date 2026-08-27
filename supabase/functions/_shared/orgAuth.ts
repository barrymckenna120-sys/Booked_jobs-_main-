// Shared caller-vs-resource authorization for Edge Functions.
//
// The IDOR class this closes: a function that receives `job_id` (or quote/cert/
// hazard id), loads the row, and then acts using THAT row's tenant credentials.
// Tenant config is correct, but the caller was never proven to belong to the
// tenant that owns the row.
//
// Correct order, enforced here:
//   authenticate caller -> derive caller org (server-side) -> load resource
//   -> read resource organisation_id -> compare -> only then act.
//
// Fails closed: if either organisation cannot be established, access is denied.

import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken, hasSharedSecret, isServiceRoleToken, resolveCaller } from "./machineAuth.ts";
import { strictMachineBinding } from "./machineOrg.ts";

export type ResourceRef = {
  /** Table holding the resource, e.g. "service_calls", "quotes", "certificates". */
  table: string;
  /** Primary key value supplied by the caller. */
  id: string | null | undefined;
  /** Column to match on (defaults to "id"). */
  idColumn?: string;
  /** Column holding the tenant id (defaults to "organisation_id"). */
  orgColumn?: string;
};

export type OrgAccessGranted = {
  /** Organisation the action must be performed against. */
  orgId: string;
  kind: "machine" | "user";
  userId?: string;
  role?: string | null;
};

export type OrgAccessResult =
  | { error: Response }
  | OrgAccessGranted;

export function isDenied(r: OrgAccessResult): r is { error: Response } {
  return (r as { error?: Response }).error instanceof Response;
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function deny(
  cors: Record<string, string>,
  status: number,
  error: string,
  fnName: string,
  detail: string,
): { error: Response } {
  console.warn(`${fnName}: access denied (${status}) — ${detail}`);
  return {
    error: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    }),
  };
}

/** Trusted server-side lookup of a user's organisation + role. */
export async function getUserOrg(
  userId: string,
): Promise<{ orgId: string | null; role: string | null }> {
  const { data } = await serviceClient()
    .from("profiles")
    .select("organisation_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    orgId: (data?.organisation_id as string | null) ?? null,
    role: (data?.role as string | null) ?? null,
  };
}

/** Trusted server-side lookup of a resource row's organisation. */
export async function getResourceOrg(ref: ResourceRef): Promise<string | null> {
  if (!ref.id) return null;
  const orgColumn = ref.orgColumn ?? "organisation_id";
  const { data } = await serviceClient()
    .from(ref.table)
    .select(orgColumn)
    .eq(ref.idColumn ?? "id", ref.id)
    .maybeSingle();
  const value = (data as Record<string, unknown> | null)?.[orgColumn];
  return typeof value === "string" && value ? value : null;
}

/**
 * Authenticate the caller and prove they may act on the given resource.
 *
 * - Machine callers (pg_cron / Make.com / another Edge Function presenting the
 *   service-role key or an approved shared secret) are trusted for the
 *   resource's own organisation. Set `allowMachine: false` to make a function
 *   user-only.
 * - User callers must have `profiles.organisation_id === resource.organisation_id`.
 *   `superadmin` is the only cross-tenant role, and that comes from the
 *   server-side profile row, never from the request.
 * - Any caller-supplied organisation_id is ignored; the returned `orgId` is
 *   always the resource's own organisation.
 */
export async function requireResourceOrgAccess(
  req: Request,
  opts: {
    fnName: string;
    cors: Record<string, string>;
    resource: ResourceRef;
    allowMachine?: boolean;
  },
): Promise<OrgAccessResult> {
  const { fnName, cors, resource } = opts;
  const allowMachine = opts.allowMachine !== false;

  if (!resource.id) {
    return deny(cors, 400, `${resource.idColumn ?? "id"} is required`, fnName, "missing resource id");
  }

  const caller = await resolveCaller(req);
  if (!caller) {
    return deny(cors, 401, "Unauthorized", fnName, "no valid credentials");
  }

  const resourceOrgId = await getResourceOrg(resource);
  if (!resourceOrgId) {
    // Do not distinguish "missing row" from "other tenant's row".
    return deny(cors, 404, "not_found", fnName, `resource ${resource.table} not found or has no organisation`);
  }

  if (caller.kind === "machine") {
    if (!allowMachine) {
      return deny(cors, 401, "Unauthorized", fnName, "machine callers not permitted");
    }
    // A global shared secret is not proof of tenancy — bind it to this row's org.
    const bound = await machineBoundToOrg(req, resourceOrgId, fnName);
    if (!bound.ok) return deny(cors, 403, "Forbidden", fnName, bound.detail);
    return { orgId: resourceOrgId, kind: "machine" };
  }

  const { orgId: callerOrgId, role } = await getUserOrg(caller.userId);
  if (!callerOrgId) {
    return deny(cors, 403, "Forbidden", fnName, "caller has no organisation");
  }

  if (callerOrgId !== resourceOrgId && role !== "superadmin") {
    return deny(
      cors,
      403,
      "Forbidden",
      fnName,
      `cross-tenant attempt: caller org ${callerOrgId} != resource org ${resourceOrgId}`,
    );
  }

  return { orgId: resourceOrgId, kind: "user", userId: caller.userId, role };
}

/**
 * For functions with no resource id: authenticate the caller and return the
 * caller's own organisation, derived server-side.
 */
export async function requireCallerOrg(
  req: Request,
  opts: { fnName: string; cors: Record<string, string>; roles?: string[] },
): Promise<OrgAccessResult> {
  const caller = await resolveCaller(req);
  if (!caller) return deny(opts.cors, 401, "Unauthorized", opts.fnName, "no valid credentials");
  if (caller.kind === "machine") {
    return deny(opts.cors, 400, "organisation_required", opts.fnName, "machine caller has no organisation context");
  }
  const { orgId, role } = await getUserOrg(caller.userId);
  if (!orgId) return deny(opts.cors, 403, "Forbidden", opts.fnName, "caller has no organisation");
  if (opts.roles && !opts.roles.includes(String(role ?? ""))) {
    return deny(opts.cors, 403, "Forbidden", opts.fnName, `role ${role ?? "none"} is not permitted`);
  }
  return { orgId, kind: "user", userId: caller.userId, role };
}

/**
 * Machine/webhook callers that must name the organisation they are acting for.
 * The organisation must exist, and where the tenant has its own webhook secret
 * configured the presented secret must match THAT tenant's secret (per-tenant
 * binding). A signed-in user is scoped to their own organisation and any
 * requested organisation_id is ignored.
 */
export async function requireBoundOrg(
  req: Request,
  opts: {
    fnName: string;
    cors: Record<string, string>;
    requestedOrgId?: string | null;
  },
): Promise<OrgAccessResult> {
  const { fnName, cors } = opts;
  const caller = await resolveCaller(req);
  if (!caller) return deny(cors, 401, "Unauthorized", fnName, "no valid credentials");

  if (caller.kind === "user") {
    const { orgId, role } = await getUserOrg(caller.userId);
    if (!orgId) return deny(cors, 403, "Forbidden", fnName, "caller has no organisation");
    if (
      opts.requestedOrgId &&
      opts.requestedOrgId !== orgId &&
      role !== "superadmin"
    ) {
      return deny(cors, 403, "Forbidden", fnName, "requested organisation_id is not the caller's org");
    }
    const effective = role === "superadmin" && opts.requestedOrgId ? opts.requestedOrgId : orgId;
    return { orgId: effective, kind: "user", userId: caller.userId, role };
  }

  const requested = (opts.requestedOrgId ?? "").trim();
  if (!requested) {
    return deny(cors, 400, "organisation_id is required", fnName, "machine caller did not name an organisation");
  }

  const supabase = serviceClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("id", requested)
    .maybeSingle();
  if (!org?.id) return deny(cors, 404, "not_found", fnName, "unknown organisation_id");

  // Per-tenant secret binding when the tenant has one configured.
  const provided = (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();
  const { data: integration } = await supabase
    .from("tenant_integrations")
    .select("config")
    .eq("organisation_id", requested)
    .eq("integration_type", "make")
    .maybeSingle();
  const tenantSecret = String(
    ((integration?.config as Record<string, unknown> | null)?.webhook_secret ?? "") as string,
  ).trim();

  if (tenantSecret) {
    if (provided !== tenantSecret) {
      return deny(cors, 403, "Forbidden", fnName, "machine secret is not bound to the requested organisation");
    }
  } else if (strictMachineBinding()) {
    return deny(
      cors,
      403,
      "Forbidden",
      fnName,
      "strict binding on: tenant has no per-tenant webhook_secret configured",
    );
  } else if (provided) {
    console.warn(
      `${fnName}: machine caller used a global shared secret for org ${requested} — ` +
        `no per-tenant webhook_secret configured (tighten by adding one).`,
    );
  }

  return { orgId: requested, kind: "machine" };
}

/**
 * Per-tenant binding for machine callers acting on a specific resource.
 *
 * A global shared secret proves "some trusted system called us", NOT "this
 * system may act for tenant X". Where the tenant has its own webhook_secret
 * configured, the presented secret must be THAT tenant's secret.
 *
 * Service-role callers (pg_cron, Edge Function -> Edge Function) are internal
 * and stay trusted for any organisation.
 */
export async function machineBoundToOrg(
  req: Request,
  orgId: string,
  fnName: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (await isServiceRoleToken(bearerToken(req))) return { ok: true };

  const provided = (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();

  const { data: integration } = await serviceClient()
    .from("tenant_integrations")
    .select("config")
    .eq("organisation_id", orgId)
    .eq("integration_type", "make")
    .maybeSingle();
  const tenantSecret = String(
    ((integration?.config as Record<string, unknown> | null)?.webhook_secret ?? "") as string,
  ).trim();

  if (tenantSecret) {
    return provided === tenantSecret
      ? { ok: true }
      : { ok: false, detail: `machine secret is not bound to organisation ${orgId}` };
  }

  if (strictMachineBinding()) {
    return {
      ok: false,
      detail: `strict binding on: organisation ${orgId} has no per-tenant webhook_secret`,
    };
  }

  if (provided || hasSharedSecret(req)) {
    console.warn(
      `${fnName}: machine caller used a global shared secret for org ${orgId} — ` +
        `no per-tenant webhook_secret configured (tighten by adding one).`,
    );
  }
  return { ok: true };
}

/**
 * Authenticate a signed-in app user. Machine credentials and the anon key are
 * both rejected. Use for browser-only endpoints that have no resource id.
 */
export async function requireAuthenticatedUser(
  req: Request,
  opts: { fnName: string; cors: Record<string, string> },
): Promise<{ error: Response } | { userId: string }> {
  const caller = await resolveCaller(req);
  if (!caller || caller.kind !== "user") {
    return deny(opts.cors, 401, "Unauthorized", opts.fnName, "a signed-in user is required");
  }
  return { userId: caller.userId };
}
