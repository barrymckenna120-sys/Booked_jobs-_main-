/**
 * public-fault-lookup — request handler.
 *
 * Public, read-only, GET-only. Returns ONLY published rows and ONLY
 * homeowner-safe fields. Every query filters status='published'; the payload
 * builders in logic.ts re-check rows and whitelist fields.
 *
 * `db` is injected so tests can exercise the full handler with a stub.
 */
import {
  isAllowedBrand,
  isValidUuid,
  buildModelsPayload,
  buildCodesPayload,
  buildLookup,
} from "./logic.ts";

export type DbResult<T> = { data: T | null; error: { message: string } | null };

type DbRow = Record<string, unknown>;

/* Minimal structural type satisfied by the real Supabase client and by tests' stubs. */
export type FaultQuery = {
  select(cols: string): FaultQuery;
  eq(col: string, val: unknown): FaultQuery;
  ilike(col: string, val: string): FaultQuery;
  maybeSingle(): PromiseLike<DbResult<DbRow | null>>;
} & PromiseLike<DbResult<DbRow[]>>;

export interface FaultDb {
  from(table: string): FaultQuery;
}

export interface HandlerDeps {
  db: FaultDb;
  allowedOrigins: () => string[];
}

const jsonResponse = (status: number, body: unknown, origin: string | null): Response => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
};

export const handle = async (req: Request, deps: HandlerDeps): Promise<Response> => {
  const origin = req.headers.get("Origin");
  // A request with no Origin header is a non-browser client (curl/monitoring):
  // CORS only restricts browsers, so only an Origin that IS present must be allowed.
  const allowed = origin !== null && deps.allowedOrigins().includes(origin) ? origin : null;

  if (req.method === "OPTIONS") {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
        "Vary": "Origin",
      },
    });
  }
  if (origin !== null && !allowed) return jsonResponse(403, { error: "origin_not_allowed" }, null);
  if (req.method !== "GET") return jsonResponse(405, { error: "method_not_allowed" }, allowed);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const bad = (code: string): Response => jsonResponse(400, { error: code }, allowed);

  try {
    if (action === "models") {
      const brand = url.searchParams.get("brand") ?? "";
      if (brand.length > 40) return bad("invalid_brand");
      const canonical = isAllowedBrand(brand);
      if (!canonical) return jsonResponse(200, [], allowed);
      const { data, error } = await deps.db
        .from("boiler_fault_models")
        .select("id, brand, model_name, status")
        .eq("status", "published")
        .ilike("brand", canonical);
      if (error) throw new Error(error.message);
      return jsonResponse(200, buildModelsPayload((data ?? []) as never), allowed);
    }

    if (action === "codes") {
      const modelId = url.searchParams.get("model_id") ?? "";
      if (!isValidUuid(modelId)) return bad("invalid_model_id");
      const model = await deps.db
        .from("boiler_fault_models")
        .select("id, brand, model_name")
        .eq("id", modelId)
        .eq("status", "published")
        .maybeSingle();
      if (model.error) throw new Error(model.error.message);
      if (!model.data) return jsonResponse(200, [], allowed);
      const { data, error } = await deps.db
        .from("boiler_fault_codes")
        .select("code, category, status, draft_test_excluded")
        .eq("model_id", modelId)
        .eq("status", "published");
      if (error) throw new Error(error.message);
      return jsonResponse(200, buildCodesPayload((data ?? []) as never), allowed);
    }

    if (action === "lookup") {
      const modelId = url.searchParams.get("model_id") ?? "";
      const code = url.searchParams.get("code") ?? "";
      if (!isValidUuid(modelId)) return bad("invalid_model_id");
      if (!code.trim() || code.length > 60) return bad("invalid_code");
      const model = await deps.db
        .from("boiler_fault_models")
        .select("id, brand, model_name")
        .eq("id", modelId)
        .eq("status", "published")
        .maybeSingle();
      if (model.error) throw new Error(model.error.message);
      if (!model.data) return jsonResponse(200, { found: false, manual_url: null }, allowed);
      const canonical = isAllowedBrand(String(model.data.brand ?? ""));
      const { data, error } = await deps.db
        .from("boiler_fault_codes")
        .select("code, category, explanation, manual_url, status, draft_test_excluded")
        .eq("model_id", modelId)
        .eq("status", "published");
      if (error) throw new Error(error.message);
      return jsonResponse(200, buildLookup((data ?? []) as never, code, canonical), allowed);
    }

    return bad("unknown_action");
  } catch (e) {
    // Log detail server-side only; never expose DB messages to the caller.
    console.error("public-fault-lookup failed:", e instanceof Error ? e.message : e);
    return jsonResponse(500, { error: "lookup_failed" }, allowed);
  }
};
