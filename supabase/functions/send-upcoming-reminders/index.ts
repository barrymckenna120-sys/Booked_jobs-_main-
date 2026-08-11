import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateOptOut } from "../_shared/optOut.ts";


serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const dbHeaders = {
    "Authorization": `Bearer ${supabaseKey}`,
    "apikey": supabaseKey,
    "Content-Type": "application/json",
  };

  // Per-org cache: orgId -> { apiKey, messageFooter } or null
  const orgCache = new Map<string, { apiKey: string; messageFooter: string } | null>();
  const loadOrgConfig = async (orgId: string) => {
    if (orgCache.has(orgId)) return orgCache.get(orgId)!;

    // WhatsApp api_key via shared resolver (api_key_secret or api_key, either row type)
    const wa = await fetchWhatsappApiKeyWithClient(supabase as any, orgId);
    const apiKey = wa.apiKey;
    if (!apiKey) {
      try {
        await supabase.from("edge_function_logs").insert({
          function_name: "send-upcoming-reminders",
          error_message: `WhatsApp credential resolution failed for org ${orgId} — skipping: ${wa.detail}`,
          payload: { organisation_id: orgId, resolution: wa.resolution, secret_name: wa.secretName },
        });
      } catch (_e) { /* best-effort */ }
      orgCache.set(orgId, null);
      return null;
    }


    let messageFooter = "";
    const { data: settings } = await supabase
      .from("settings")
      .select("message_footer,business_name,company_name")
      .eq("organisation_id", orgId)
      .limit(1)
      .maybeSingle();
    const s: any = settings;
    messageFooter = s?.message_footer || s?.business_name || s?.company_name || "our team";

    const cfg = { apiKey, messageFooter };
    orgCache.set(orgId, cfg);
    return cfg;
  };

  try {
    // Calculate target date (2 days ahead)
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    // Fetch jobs scheduled for target date
    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        assigned_engineer,
        status,
        customer_id,
        organisation_id,
        customers ( name, phone, opted_out )
      `)
      .eq("scheduled_date", targetStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) {
      throw new Error(`DB query failed: ${error.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0, failed: 0, detail: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ job_id: string; customer_name: string; status: string; error?: string }> = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const job of jobs as any[]) {
      const customerName = job.customers?.name;
      const customerPhone = job.customers?.phone;
      const orgId = job.organisation_id;

      if (!orgId) {
        skipped++;
        results.push({ job_id: job.id, customer_name: customerName || "Unknown", status: "skipped", error: "Missing organisation_id" });
        try {
          await supabase.from("edge_function_logs").insert({
            function_name: "send-upcoming-reminders",
            error_message: `Service call ${job.id} missing organisation_id — skipped`,
            payload: { job_id: job.id },
          });
        } catch (_) { /* best-effort */ }
        continue;
      }

      // Opt-out guard: appointment reminders are automated outreach, so an
      // opted-out customer (STOP reply or staff toggle) is never messaged.
      const optOut = evaluateOptOut(job.customers);
      if (optOut.skip) {
        skipped++;
        results.push({
          job_id: job.id,
          customer_name: customerName || "Unknown",
          status: "skipped",
          error: optOut.reason,
        });
        continue;
      }


      const orgCfg = await loadOrgConfig(orgId);
      if (!orgCfg) {
        skipped++;
        results.push({ job_id: job.id, customer_name: customerName || "Unknown", status: "skipped", error: "WhatsApp integration not configured" });
        continue;
      }
      const { apiKey, messageFooter } = orgCfg;

      const firstName = customerName ? customerName.split(" ")[0] : "Customer";
      const timeSlot = job.time_block || "TBC";
      const jobType = job.job_type || "service";
      const engineerName = job.assigned_engineer || "our engineer";

      const message = `Appointment Reminder 📅
${messageFooter}

Hi ${firstName}, just a reminder that your ${jobType} is booked for ${targetStr} between ${timeSlot}.

Your engineer ${engineerName} will be with you on the day. If you need to reschedule, please give us a call.

Thanks,
${messageFooter}`;

      // Log pending message
      const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
        method: "POST",
        headers: { ...dbHeaders, "Prefer": "return=representation" },
        body: JSON.stringify({
          customer_id: job.customer_id,
          organisation_id: orgId,
          message_type: "appointment_reminder",
          channel: "whatsapp",
          direction: "outbound",
          content: message,
          status: "pending",
          related_id: job.id,
          related_type: "service_call",
          sent_by: "system",
          sent_at: new Date().toISOString(),
        }),
      });
      const logRows = await logRes.json();
      const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

      // Send via 360Messenger
      const cleanNumber = customerPhone.replace(/^\+/, "");
      const formData = new FormData();
      formData.append("phonenumber", cleanNumber);
      formData.append("text", message);

      try {
        const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });

        const resultText = await response.text();
        let result: any;
        try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

        // Update message_log status
        if (logId) {
          const updateBody = result.success
            ? { status: "sent" }
            : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

          await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify(updateBody),
          });
        }

        if (result.success) {
          sent++;
          results.push({ job_id: job.id, customer_name: customerName, status: "sent" });
          // Log customer activity
          try {
            await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
              method: "POST", headers: dbHeaders,
              body: JSON.stringify({
                organisation_id: orgId,
                customer_id: job.customer_id,
                service_call_id: job.id,
                event_type: "whatsapp_sent",
                event_label: "WhatsApp sent — Appointment Reminder",
              }),
            });
          } catch { /* non-critical */ }
        } else {
          failed++;
          const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 300)}`;
          results.push({ job_id: job.id, customer_name: customerName, status: "failed", error: errorDetail });

          // Log failure
          await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              function_name: "send-upcoming-reminders",
              error_message: `Failed to send reminder to ${customerName} (${customerPhone})`,
              payload: { api_response: result, sent_to: customerPhone, job_id: job.id },
            }),
          });
        }
      } catch (sendErr: any) {
        failed++;
        results.push({ job_id: job.id, customer_name: customerName, status: "failed", error: sendErr.message });

        if (logId) {
          await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify({ status: "failed", error_message: sendErr.message }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent, skipped, failed, total: jobs.length, detail: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Log top-level error
    try {
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          function_name: "send-upcoming-reminders",
          error_message: err.message || String(err),
          payload: null,
        }),
      });
    } catch (_) { /* best-effort */ }

    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
