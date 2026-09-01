/**
 * BJ-0131 Phase 2 — preview-customer-import
 *
 * Read-only duplicate detection for the customer Excel import. Moves the trust
 * boundary off the browser: the organisation is derived from the caller's
 * profile server-side, and every existing-customer lookup is scoped to it, so a
 * record belonging to another tenant can never be returned as a match.
 *
 * PREVIEW WRITES NOTHING. No customers, no import_runs, no audit_log, no status
 * columns. Everything below is SELECT-only, deliberately.
 *
 * Request  { rows: [{ rowNum, name, phone, address, eircode, gprn }], organisation_id? }
 * Response { rows: [{ rowNum, matches: [{ customer, reason }] }], history, orgId }
 *
 * `organisation_id` in the body is NOT trusted. For a normal user it must equal
 * their own organisation or the request is rejected; only a superadmin may name
 * another organisation (that is the app's existing "View As" mode).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { isDenied, requireAuthenticatedUser, requireBoundOrg } from "../_shared/orgAuth.ts";
import {
  matchExistingCustomers,
  normaliseGprnKey,
  normalisePhoneKey,
  type ExistingCustomerLite,
  type ExistingMatchResult,
} from "../_shared/importDuplicates.ts";

const FN = "preview-customer-import";

/** Roles allowed to run an import. Engineers are office-side excluded. */
const IMPORT_ROLES = ["admin", "office", "superadmin"];

type PreviewRow = {
  rowNum: number;
  name?: unknown;
  phone?: unknown;
  address?: unknown;
  eircode?: unknown;
  gprn?: unknown;
};

const MAX_ROWS = 20000;
const CHUNK = 200;

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return handlePreflight();
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors });
  }

  // 1. A signed-in user is required: machine credentials and the anon key are
  //    both rejected before anything is read.
  const authed = await requireAuthenticatedUser(req, { fnName: FN, cors });
  if ("error" in authed) return authed.error;

  let body: { rows?: unknown; organisation_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  // 2. Organisation is derived server-side. A body-supplied organisation_id is
  //    only honoured for superadmin View-As; anyone else naming a different org
  //    gets a 403 from requireBoundOrg.
  const access = await requireBoundOrg(req, {
    fnName: FN,
    cors,
    requestedOrgId: typeof body.organisation_id === "string" ? body.organisation_id : null,
  });
  if (isDenied(access)) return access.error;
  if (access.kind !== "user") {
    return jsonResponse({ error: "Unauthorized" }, { status: 401, headers: cors });
  }
  if (!IMPORT_ROLES.includes(String(access.role ?? ""))) {
    console.warn(`${FN}: role ${access.role ?? "none"} may not preview imports`);
    return jsonResponse({ error: "Forbidden" }, { status: 403, headers: cors });
  }
  const orgId = access.orgId;

  const rawRows = Array.isArray(body.rows) ? (body.rows as PreviewRow[]) : null;
  if (!rawRows) {
    return jsonResponse({ error: "rows must be an array" }, { status: 400, headers: cors });
  }
  if (rawRows.length > MAX_ROWS) {
    return jsonResponse(
      { error: `too many rows (max ${MAX_ROWS})` },
      { status: 400, headers: cors },
    );
  }

  const rows = rawRows
    .filter((r) => Number.isFinite(Number(r?.rowNum)))
    .map((r) => ({
      rowNum: Number(r.rowNum),
      data: {
        name: r.name ?? null,
        phone: r.phone ?? null,
        address: r.address ?? null,
        eircode: r.eircode ?? null,
        gprn: r.gprn ?? null,
      },
    }));

  const supabase = serviceClient();

  // 3. Candidate lookup, always narrowed to this organisation. Phone and GPRN
  //    match directly; eircode widens the net so a name+address match can be
  //    found without reading the whole customer table. Backed by the Phase 1
  //    (organisation_id, phone|gprn|eircode) indexes.
  const keys = { phone: new Set<string>(), gprn: new Set<string>(), eircode: new Set<string>() };
  for (const r of rows) {
    const phone = String(r.data.phone ?? "").trim();
    if (phone) keys.phone.add(phone);
    const gprn = String(r.data.gprn ?? "").trim();
    if (gprn) keys.gprn.add(gprn);
    const eircode = String(r.data.eircode ?? "").trim();
    if (eircode) keys.eircode.add(eircode);
  }

  const byId = new Map<string, ExistingCustomerLite>();
  try {
    for (const column of ["phone", "gprn", "eircode"] as const) {
      const values = Array.from(keys[column]);
      for (let i = 0; i < values.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, address, eircode, phone, gprn")
          .eq("organisation_id", orgId)
          .in(column, values.slice(i, i + CHUNK));
        if (error) throw error;
        for (const c of data ?? []) byId.set(c.id as string, c as ExistingCustomerLite);
      }
    }
  } catch (_e) {
    console.error(`${FN}: candidate lookup failed:`, _e);
    return jsonResponse({ error: "lookup_failed" }, { status: 500, headers: cors });
  }

  const existing = Array.from(byId.values());

  // 4. Classification runs through the shared matcher — the same module the
  //    browser mirror uses, so the preview the operator reviews and the commit
  //    that follows cannot disagree about what is a duplicate.
  const matchedIds = new Set<string>();
  const resultRows = rows.map((r) => {
    const matches: ExistingMatchResult[] = matchExistingCustomers(r.data, existing);
    if (matches.length === 1) matchedIds.add(matches[0].customer.id);
    return { rowNum: r.rowNum, matches };
  });

  // 5. Linked-history counts for the single-match customers the review panel
  //    shows. Org-scoped as well, so a count can never be inflated by another
  //    tenant's rows.
  const ids = Array.from(matchedIds);
  const history: Record<string, { jobs: number; quotes: number; payments: number }> = {};
  for (const id of ids) history[id] = { jobs: 0, quotes: 0, payments: 0 };
  try {
    const tally = async (
      table: "service_calls" | "quotes" | "job_payments",
      key: "jobs" | "quotes" | "payments",
    ) => {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from(table)
          .select("customer_id")
          .eq("organisation_id", orgId)
          .in("customer_id", ids.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as { customer_id: string | null }[]) {
          if (row.customer_id && history[row.customer_id]) history[row.customer_id][key] += 1;
        }
      }
    };
    if (ids.length > 0) {
      await tally("service_calls", "jobs");
      await tally("quotes", "quotes");
      await tally("job_payments", "payments");
    }
  } catch (_e) {
    console.error(`${FN}: history tally failed:`, _e);
    return jsonResponse({ error: "lookup_failed" }, { status: 500, headers: cors });
  }

  // Unused here but kept honest: normalisers are imported from the shared module
  // so a future change to key semantics cannot silently apply to only one side.
  void normalisePhoneKey;
  void normaliseGprnKey;

  return jsonResponse(
    { orgId, rows: resultRows, history, candidateCount: existing.length },
    { headers: cors },
  );
});
