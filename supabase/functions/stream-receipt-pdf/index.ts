import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { extractStoragePath } from "../_shared/signDocumentUrl.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import { parseReceiptStreamRequest, receiptPdfFilename } from "../_shared/receiptStream.ts";

const jsonError = (cors: Record<string, string>, status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function orgIdForOrigin(
  supabase: ReturnType<typeof createClient>,
  origin: string | null,
): Promise<string | null> {
  let hostname: string;
  try {
    hostname = origin ? new URL(origin).hostname.toLowerCase() : "";
  } catch (_e) {
    return null;
  }
  if (!hostname) return null;

  const { data, error } = await supabase
    .from("organisations")
    .select("id, public_domain")
    .not("public_domain", "is", null);
  if (error) return null;

  const match = (data ?? []).find((organisation) => {
    const domain = String(organisation.public_domain ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    return domain && (hostname === domain || hostname.endsWith(`.${domain}`));
  });
  return match?.id ? String(match.id) : null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(corsHeaders, 405, "method_not_allowed");

  try {
    const request = parseReceiptStreamRequest(await req.json().catch(() => null));
    if (!request) return jsonError(corsHeaders, 400, "invalid_request");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return jsonError(corsHeaders, 503, "unavailable");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabase
      .from("service_calls")
      .select("id, organisation_id, receipt_number, receipt_pdf_url");

    if (request.kind === "authenticated") {
      const access = await requireResourceOrgAccess(req, {
        fnName: "stream-receipt-pdf",
        cors: corsHeaders,
        resource: { table: "service_calls", id: request.jobId },
        allowMachine: false,
      });
      if (isDenied(access)) return access.error;
      query = query.eq("id", request.jobId).eq("access_token", request.token).eq("organisation_id", access.orgId);
    } else {
      const originOrgId = await orgIdForOrigin(supabase, req.headers.get("origin"));
      if (!originOrgId) return jsonError(corsHeaders, 404, "not_found");
      query = query.eq("receipt_number", request.receiptNumber).eq("organisation_id", originOrgId);
    }

    const { data: receipt, error: lookupError } = await query.maybeSingle();
    if (lookupError) {
      console.error("[stream-receipt-pdf] lookup failed", lookupError);
      return jsonError(corsHeaders, 503, "lookup_failed");
    }
    if (!receipt?.receipt_pdf_url) return jsonError(corsHeaders, 404, "not_found");

    const objectPath = extractStoragePath("certificates", receipt.receipt_pdf_url);
    if (!objectPath || !objectPath.startsWith(`${receipt.organisation_id}/`)) {
      return jsonError(corsHeaders, 404, "not_found");
    }

    const { data: pdf, error: downloadError } = await supabase.storage
      .from("certificates")
      .download(objectPath);
    if (downloadError || !pdf) {
      console.error("[stream-receipt-pdf] download failed", downloadError);
      return jsonError(corsHeaders, 503, "download_failed");
    }

    return new Response(await pdf.arrayBuffer(), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${receiptPdfFilename(receipt.receipt_number)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[stream-receipt-pdf] fatal", error);
    return jsonError(corsHeaders, 500, "unavailable");
  }
});