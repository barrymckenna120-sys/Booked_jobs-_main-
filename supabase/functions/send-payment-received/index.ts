import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Auth guard (audit finding #1) — this function used to be anonymously
 * invokable. Accepts exactly the credentials our real callers already send:
 *  - Make.com / internal machine callers: `x-webhook-secret` or `x-make-secret`
 *    === MAKE_WEBHOOK_SECRET, or `Authorization: Bearer <service role key>`.
 *  - Signed-in app users: a valid Supabase user JWT.
 * The anon/publishable key alone is rejected — that is the hole being closed.
 */
function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function isMachineCaller(req: Request): boolean {
  const expected = (Deno.env.get("MAKE_WEBHOOK_SECRET") ?? "").trim();
  const provided = (req.headers.get("x-webhook-secret") ?? req.headers.get("x-make-secret") ?? "").trim();
  if (expected && provided && provided === expected) return true;
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const token = bearerToken(req);
  return Boolean(serviceRoleKey && token && token === serviceRoleKey);
}

async function authoriseRequest(req: Request): Promise<{ ok: boolean; reason?: string }> {
  if (isMachineCaller(req)) return { ok: true };
  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "missing_credentials" };
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl) return { ok: false, reason: "auth_unavailable" };
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return { ok: false, reason: `invalid_token_${res.status}` };
    const user = await res.json();
    if (!user?.id) return { ok: false, reason: "no_user" };
    return { ok: true };
  } catch (_e) {
    return { ok: false, reason: `auth_check_failed: ${(_e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authoriseRequest(req);
  if (!auth.ok) {
    console.warn(`send-payment-received: unauthorized call (${auth.reason})`);
    return new Response(JSON.stringify({ error: "Unauthorized", reason: auth.reason }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { service_call_id } = await req.json();
    if (!service_call_id) return json({ error: "service_call_id is required" }, 400);

    // 1. Fetch job + customer
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select(
        "id, organisation_id, job_reference, job_type, scheduled_date, revenue, customer_id, access_token"
      )
      .eq("id", service_call_id)
      .single();

    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, opted_out")
      .eq("id", job.customer_id)
      .single();

    if (!customer) return json({ error: "Customer not found" }, 404);

    if (customer.opted_out) {
      return json({ success: true, message: "Customer opted out" });
    }

    if (!customer.phone) return json({ error: "Customer has no phone number" }, 400);

    // 2. Receipt / invoice number
    const { data: invoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("job_id", service_call_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const invoiceNumber = invoice?.invoice_number || "—";

    // 3. WhatsApp API key — single shared resolver (api_key_secret or literal api_key)
    const keyRes = await fetchWhatsappApiKeyWithClient(supabase, job.organisation_id);
    if (!keyRes.apiKey) {
      console.error(
        `[send-payment-received] no WhatsApp key for org ${job.organisation_id} (${keyRes.resolution})`,
      );
      return json(
        { error: "WhatsApp integration not configured", detail: keyRes.detail, resolution: keyRes.resolution },
        400,
      );
    }
    const apiKey = keyRes.apiKey;




    // 4. Format fields
    let scheduledDate = "—";
    if (job.scheduled_date) {
      const d = new Date(`${job.scheduled_date}T12:00:00`);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      scheduledDate = `${dd}/${mm}/${yyyy}`;
    }

    const amountPaid = `€${Number(job.revenue || 0).toFixed(2)}`;

    const jobRef =
      job.job_reference ||
      `KN-${(job.id || "").replace(/-/g, "").substring(0, 6).toUpperCase()}`;

    const { data: orgRow } = await supabase
      .from("organisations")
      .select("public_domain")
      .eq("id", job.organisation_id)
      .maybeSingle();
    const orgDomain = orgRow?.public_domain || "";
    const receiptUrl = orgDomain && job.access_token
      ? `https://${orgDomain}/receipt/${job.access_token}`
      : null;
    if (!receiptUrl) {
      console.warn(`[send-payment-received] organisation ${job.organisation_id} missing public_domain or job missing access_token; omitting receipt link`);
    }

    // 5. Normalise phone
    let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) phone = "353" + phone.substring(1);

    // 5b. Tenant branding — this org's own 360messenger config only. No shared
    // fallback: a blank value skips-and-logs rather than signing this tenant's
    // message with another tenant's business name (BJ-B2b).
    const { data: messengerConfig } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", job.organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();
    const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();

    if (!companyName) {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-payment-received",
        error_message: "Skipped: company_name_not_configured for organisation",
        payload: {
          organisation_id: job.organisation_id,
          service_call_id,
          reason: "company_name_not_configured",
        },
      });
      return json({
        success: false,
        whatsapp_sent: false,
        skipped: true,
        reason: "company_name_not_configured",
      }, 200);
    }

    // 6. Build message
    const message =
      `Hi ${customer.name}, thanks for your payment. Here is your receipt:\n\n` +
      `Job Ref: ${jobRef}\n` +
      `Receipt: ${invoiceNumber}\n` +
      `Service: ${job.job_type || "—"}\n` +
      `Date: ${scheduledDate}\n` +
      `Amount Paid: ${amountPaid}\n\n` +
      (receiptUrl ? `View your receipt here: ${receiptUrl}\n\n` : "") +
      `Thanks,\n` +
      companyName;

    // 7. Send via 360 Messenger
    const formData = new FormData();
    formData.append("phonenumber", phone);
    formData.append("text", message);

    const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const respText = await resp.text();
    const ok = resp.ok;

    // 8. Log via log-message edge function
    try {
      await fetch(`${supabaseUrl}/functions/v1/log-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          service_call_id,
          organisation_id: job.organisation_id,
          message_type: "payment_received",
          recipient_phone: phone,
          message_body: message,
          status: ok ? "success" : "fail",
        }),
      });
    } catch (_e) {
      console.error("log-message invoke failed", _e);
    }

    if (!ok) {
      return json({ error: "Failed to send WhatsApp message", detail: respText }, 502);
    }

    // 9. Mark as sent
    await supabase
      .from("service_calls")
      .update({ payment_received_whatsapp_sent: true })
      .eq("id", service_call_id);

    return json({ success: true });
  } catch (e) {
    console.error("send-payment-received error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
