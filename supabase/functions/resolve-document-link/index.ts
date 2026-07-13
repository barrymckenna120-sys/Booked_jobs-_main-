// Public resolver: takes an access_token, looks up the matching document
// row, mints a short-lived signed Storage URL, and 302-redirects the
// caller. Used by the front-end redirect pages (CertificateRedirect,
// PdfRedirect, ReceiptRedirect, InvoiceRedirect, HazardRedirect).
//
// - No JWT required (verify_jwt = false in supabase/config.toml).
// - Only reads a single row keyed by an unguessable uuid access_token.
// - Returns 404 JSON on any lookup miss so the client can render its
//   "link not found" state without exposing internals.

import { createClient } from "npm:@supabase/supabase-js@2";
import { signDocumentUrl, extractStoragePath } from "../_shared/signDocumentUrl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type DocType = "certificate" | "quote" | "receipt" | "invoice" | "hazard";

interface DocConfig {
  table: string;
  bucket: "certificates" | "quote-pdfs";
  urlColumn: string;
}

const DOC_CONFIG: Record<DocType, DocConfig> = {
  certificate: { table: "certificates",           bucket: "certificates", urlColumn: "pdf_url" },
  quote:       { table: "quotes",                 bucket: "quote-pdfs",   urlColumn: "pdf_url" },
  receipt:     { table: "service_calls",          bucket: "certificates", urlColumn: "receipt_pdf_url" },
  invoice:     { table: "invoices",               bucket: "quote-pdfs",   urlColumn: "pdf_url" },
  hazard:      { table: "hazard_notifications",   bucket: "certificates", urlColumn: "pdf_url" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Legacy certificate-number format used in pre-migration WhatsApp links,
// e.g. "DG-2026-5204". Only honoured for the "certificate" doc type — other
// document types were never exposed with cert-number-style URLs.
const LEGACY_CERT_NUMBER_RE = /^[A-Z]{2,4}-\d{4}-\d+$/;

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let type = (url.searchParams.get("type") || "").toLowerCase() as DocType;
    let token = url.searchParams.get("token") || "";

    if ((!type || !token) && req.method === "POST") {
      try {
        const body = await req.json();
        type = ((body?.type || type || "") as string).toLowerCase() as DocType;
        token = String(body?.token || token || "");
      } catch { /* ignore */ }
    }

    if (!type || !DOC_CONFIG[type]) return notFound();
    if (!UUID_RE.test(token)) return notFound();

    const cfg = DOC_CONFIG[type];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: row, error } = await sb
      .from(cfg.table)
      .select(`${cfg.urlColumn}, organisation_id`)
      .eq("access_token", token)
      .maybeSingle();

    if (error) {
      console.error("[resolve-document-link] lookup error:", error);
      return notFound();
    }
    if (!row) return notFound();

    const stored = (row as any)[cfg.urlColumn] as string | null;
    if (!stored) return notFound();

    const objectPath = extractStoragePath(cfg.bucket, stored);
    if (!objectPath) return notFound();

    const signed = await signDocumentUrl(cfg.bucket, objectPath, 3600);
    if (!signed) return notFound();

    // Prefer a JSON response the client can follow; the redirect pages
    // do the actual window.location.replace so PWA/service-worker
    // interception behaves consistently.
    return new Response(JSON.stringify({ signed_url: signed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resolve-document-link] fatal:", err);
    return notFound();
  }
});
