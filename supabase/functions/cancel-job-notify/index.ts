import { createClient } from "npm:@supabase/supabase-js@2";
import {
  consentSkipResponse,
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";
import { logMessage } from "../_shared/logMessage.ts";
import { getOrgBrandingClient } from "../_shared/orgBranding.ts";
import { getCorsHeaders } from "../_shared/cors.ts";


const SKIP_REASONS = new Set([
  "Duplicate Booking",
  "Payment Failed",
  "Engineer Unavailable",
  "Parts Needed",
  "Other",
]);

const SALUTATIONS = new Set(["mr", "mrs", "ms", "dr", "miss"]);

function extractFirstName(fullName: string): string {
  if (!fullName) return "there";
  const parts = fullName.trim().split(/\s+/);
  for (const p of parts) {
    const cleaned = p.replace(/\.$/, "").toLowerCase();
    if (!SALUTATIONS.has(cleaned)) return p.replace(/\.$/, "");
  }
  return parts[0] || "there";
}

function formatPhone360(raw: string): string {
  if (!raw) return "";
  let n = raw.replace(/[\s+]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("353")) return n;
  if (n.startsWith("0")) n = n.slice(1);
  return "353" + n;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticated-only: organisation_id is never accepted from the body, it is
    // derived from the caller's JWT via get_my_org_id().
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerOrgId, error: orgErr } = await supabaseUser.rpc("get_my_org_id");
    if (orgErr || !callerOrgId) {
      return new Response(JSON.stringify({ error: "Forbidden: no organisation for caller" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { service_call_id, cancellation_reason } = await req.json();

    if (!service_call_id || !cancellation_reason) {
      return new Response(
        JSON.stringify({ error: "Missing service_call_id or cancellation_reason" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (SKIP_REASONS.has(cancellation_reason)) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );


    const { data: sc, error: scErr } = await supabase
      .from("service_calls")
      .select("id, user_id, customer_id, organisation_id, customers(name, phone)")
      .eq("id", service_call_id)
      .maybeSingle();

    if (scErr || !sc) {
      return new Response(
        JSON.stringify({ error: "Service call not found", detail: scErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Tenant isolation first: the job must belong to the caller's organisation.
    if ((sc as any).organisation_id && (sc as any).organisation_id !== callerOrgId) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Consent gate: opted_out customers are never messaged, and the recipient
    // number comes from the DB row only.
    const consent = await requireCustomerMessagingConsent({
      fnName: "cancel-job-notify",
      orgId: callerOrgId,
      customerId: (sc as any).customer_id,
    });
    if (!consent.allowed) return consentSkipResponse(consent.reason, corsHeaders);

    const customerName = consent.name || "";
    const firstName = extractFirstName(customerName);
    const to = formatPhone360(consent.phone);

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Customer phone missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const orgId = callerOrgId as string;

    // Fetch WhatsApp api_key from tenant_integrations
    // WhatsApp api_key via shared resolver (api_key_secret or api_key, either row type)
    const wa = await fetchWhatsappApiKeyWithClient(supabase as any, orgId);
    if (!wa.apiKey) {
      return new Response(
        JSON.stringify({ error: `WhatsApp not configured: ${wa.detail}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const apiKey = wa.apiKey;


    const branding = await getOrgBrandingClient(supabase, orgId);
    const rebookLine = branding.phone ? ` To rebook please call us on ${branding.phone}.` : "";
    const text = `Hi ${firstName}, your booking with ${branding.name} has been cancelled. Reason: ${cancellation_reason}.${rebookLine}`;
    const form = new FormData();
    form.append("phonenumber", to);
    form.append("text", text);

    const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const respText = await resp.text();

    if (!resp.ok) {
      await logMessage(supabase, {
        organisation_id: orgId,
        customer_id: (sc as any).customer_id,
        message_type: "cancel_job_notify",
        content: text,
        status: "failed",
        channel: "whatsapp",
        sent_by: (sc as any).user_id ?? undefined,
      });
      return new Response(
        JSON.stringify({ error: "360Messenger send failed", status: resp.status, detail: respText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("whatsapp_messages").insert({
      user_id: (sc as any).user_id,
      customer_id: (sc as any).customer_id,
      organisation_id: orgId,
      message_type: "template",
      message_body: `Template: job_cancellation_notice | ${firstName}, ${cancellation_reason}`,
      status: "sent",
      sent_by: "system",
      sent_at: new Date().toISOString(),
    });

    await logMessage(supabase, {
      organisation_id: orgId,
      customer_id: (sc as any).customer_id,
      message_type: "cancel_job_notify",
      content: text,
      status: "sent",
      channel: "whatsapp",
      sent_by: (sc as any).user_id ?? undefined,
    });

    return new Response(
      JSON.stringify({ success: true, to, firstName, response: respText }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
