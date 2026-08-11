import { createClient } from "npm:@supabase/supabase-js@2";
import { logMessage } from "../_shared/logMessage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Per-org integration cache: orgId -> { companyName, companyPhone, countryCode, apiKey } or null if missing
  const orgIntegrationCache = new Map<string, {
    companyName: string;
    companyPhone: string;
    countryCode: string;
    apiKey: string | undefined;
  } | null>();

  const loadOrgIntegration = async (orgId: string) => {
    if (orgIntegrationCache.has(orgId)) return orgIntegrationCache.get(orgId)!;

    const { data: waIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const { data: msgIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const waCfg = (waIntegration as any)?.config || {};
    const msgCfg = (msgIntegration as any)?.config || {};
    // Resolve per-tenant key: declared secret name wins; never fall back to
    // another tenant's key when a secret name is declared.
    const apiKeySecretName = waCfg.api_key_secret as string | undefined;
    const apiKey = apiKeySecretName
      ? Deno.env.get(apiKeySecretName)
      : (waCfg.api_key || Deno.env.get("THREESIXTY_API_KEY"));

    if (!apiKey) {
      try {
        await supabase.from("edge_function_logs").insert({
          function_name: "job-reminder-2day",
          error_message: apiKeySecretName
            ? `Secret ${apiKeySecretName} not set for org ${orgId} — skipping jobs`
            : `No whatsapp tenant_integration api_key for org ${orgId} — skipping jobs`,
          payload: { organisation_id: orgId },
        });
      } catch (_e) { /* best-effort */ }
      orgIntegrationCache.set(orgId, null);
      return null;
    }


    const resolved = {
      companyName: msgCfg.company_name,
      companyPhone: msgCfg.company_phone,
      countryCode: String(msgCfg.country_code || ""),
      apiKey,
    };
    orgIntegrationCache.set(orgId, resolved);
    return resolved;
  };

  try {
    // Calculate target date (today + 2 days)
    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    // Query scheduled jobs for target date that haven't had reminder sent (across all orgs)
    const { data: jobs, error: jobErr } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        assigned_engineer,
        assigned_engineer_id,
        customer_id,
        organisation_id,
        customers ( name, phone, opted_out )
      `)
      .eq("scheduled_date", targetStr)
      .in("status", ["Booked", "Scheduled"])
      .neq("reminder_2day_sent", true);


    if (jobErr) throw jobErr;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ total: 0, sent: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get engineer names for assigned jobs
    const engineerIds = [...new Set(jobs.filter((j: any) => j.assigned_engineer_id).map((j: any) => j.assigned_engineer_id))];
    const engineerMap = new Map<string, string>();

    if (engineerIds.length > 0) {
      const { data: engineers } = await supabase
        .from("engineers")
        .select("id, name")
        .in("id", engineerIds);
      for (const eng of engineers || []) {
        engineerMap.set(eng.id, eng.name);
      }
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const job of jobs as any[]) {
      const customer = job.customers;
      if (!customer || customer.opted_out === true || !customer.phone) {
        skipped++;
        continue;
      }

      const orgId = job.organisation_id;
      if (!orgId) {
        skipped++;
        continue;
      }

      const integration = await loadOrgIntegration(orgId);
      if (!integration) {
        skipped++;
        continue;
      }

      const { companyName, companyPhone, countryCode, apiKey } = integration;

      const fullName = customer.name || "Customer";
      const firstName = fullName.split(" ")[0];
      const engineerName = engineerMap.get(job.assigned_engineer_id) || job.assigned_engineer || "our engineer";

      // Format date as DD/MM/YYYY
      const [year, month, day] = (job.scheduled_date as string).split("-");
      const formattedDate = `${day}/${month}/${year}`;

      // Format time block to 12-hour start time only (no end_time field exists on service_calls)
      const timeBlock = job.time_block || "TBC";
      let formattedTime = timeBlock;
      const timeMatch = timeBlock.match(/^(\d{1,2})(?::(\d{2}))?/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const mins = timeMatch[2] || "00";
        const ampm = hour >= 12 ? "pm" : "am";
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
        formattedTime = mins === "00" ? `${hour}${ampm}` : `${hour}:${mins}${ampm}`;
      }

      // Normalise phone number using configured country code
      let digits = customer.phone.replace(/\D/g, "");
      const ccLen = countryCode.length;
      if (countryCode && digits.startsWith(countryCode) && digits.length === 9 + ccLen) {
        // already international
      } else if (digits.startsWith("0") && digits.length === 10) {
        digits = countryCode + digits.slice(1);
      } else if (digits.length === 9) {
        digits = countryCode + digits;
      }
      const cleanNumber = digits;

      const message = `Hi ${firstName},

This is a reminder from ${companyName} that your appointment is confirmed for ${formattedDate} at ${formattedTime}.

Your engineer will be ${engineerName}.

Please reply CONFIRM to confirm your appointment or CANCEL to cancel. Alternatively call us on ${companyPhone}.

${companyName} ☎ ${companyPhone}`;

      try {
        const formData = new FormData();
        formData.append("phonenumber", cleanNumber);
        formData.append("text", message);

        const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });

        const resultText = await response.text();
        let result: any;
        try { result = JSON.parse(resultText); } catch (_e) { result = { success: false, raw: resultText }; }

        // Log result
        await supabase.from("edge_function_logs").insert({
          function_name: "job-reminder-2day",
          error_message: result.success
            ? `Sent to ${fullName} (${cleanNumber})`
            : `Failed: ${resultText.substring(0, 500)}`,
          payload: { job_id: job.id, customer_name: fullName, phone: cleanNumber, api_response: result },
        });

        if (result.success) {
          // Mark reminder as sent
          await supabase
            .from("service_calls")
            .update({ reminder_2day_sent: true })
            .eq("id", job.id);
          sent++;
          await logMessage(supabase, {
            organisation_id: orgId,
            customer_id: job.customer_id,
            message_type: "job_reminder_2day",
            content: message,
            status: "sent",
            channel: "whatsapp",
          });
          // Log customer activity
          try {
            await supabase.from("customer_activity").insert({
              organisation_id: orgId,
              customer_id: job.customer_id,
              service_call_id: job.id,
              event_type: "whatsapp_sent",
              event_label: "WhatsApp sent — 2-Day Reminder",
            });
          } catch { /* non-critical */ }
          // Success log
          try {
            await supabase.from("edge_function_logs").insert({
              function_name: "job-reminder-2day",
              payload: { service_call_id: job.id, customer_name: fullName, phone: cleanNumber },
              error_message: null,
            });
          } catch { /* non-critical */ }
        } else {
          errors++;
          await logMessage(supabase, {
            organisation_id: orgId,
            customer_id: job.customer_id,
            message_type: "job_reminder_2day",
            content: message,
            status: "failed",
            channel: "whatsapp",
          });
        }
      } catch (sendErr: any) {
        errors++;
        await supabase.from("edge_function_logs").insert({
          function_name: "job-reminder-2day",
          error_message: `Exception sending to ${fullName}: ${sendErr.message}`,
          payload: { job_id: job.id, customer_name: fullName },
        });
      }
    }

    const total = sent + skipped + errors;
    return new Response(
      JSON.stringify({ total, sent, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "job-reminder-2day",
        error_message: err.message || String(err),
        payload: null,
      });
    } catch (_e) { /* best-effort */ }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
