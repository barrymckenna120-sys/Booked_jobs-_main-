import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { service_call_id } = await req.json();
    if (!service_call_id) return json({ error: "service_call_id is required" }, 400);

    // 1. Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, organisation_id, scheduled_date, time_block, customer_id, assigned_engineer_id, assigned_engineer")
      .eq("id", service_call_id)
      .maybeSingle();

    if (jobErr || !job) return json({ error: "Job not found", detail: jobErr?.message }, 404);

    // Customer
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, opted_out")
      .eq("id", job.customer_id)
      .single();

    if (!customer) return json({ error: "Customer not found" }, 404);

    if (customer.opted_out) {
      return json({ message: "Customer opted out" });
    }

    if (!customer.phone) {
      console.warn("send-schedule-confirmation skipped: customer has no phone", {
        service_call_id,
        customer_id: job.customer_id,
      });
      return json({ success: true, skipped: true, reason: "no_phone" });
    }

    // Engineer
    let engineerName = job.assigned_engineer || "TBC";
    if (job.assigned_engineer_id) {
      const { data: eng } = await supabase
        .from("engineers")
        .select("name")
        .eq("id", job.assigned_engineer_id)
        .maybeSingle();
      if (eng?.name) engineerName = eng.name;
    }

    // 2. WhatsApp integration
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", job.organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const messengerSettings = (integration?.config as any) ?? {};
    const apiKeySecretName = messengerSettings.api_key_secret as string | undefined;
    // Never fall back to another tenant's key: if this org declares a secret name,
    // that secret is the only acceptable credential.
    const apiKey = apiKeySecretName
      ? Deno.env.get(apiKeySecretName)
      : (messengerSettings.api_key
        ?? Deno.env.get("THREESIXTY_API_KEY")
        ?? Deno.env.get("MESSENGER_API_KEY"));
    if (!apiKey) return json({ error: "WhatsApp API key not configured for this organisation" }, 400);


    // 2b. Branding from settings
    const { data: settingsRow } = await supabase
      .from("settings")
      .select("company_name, company_phone, message_footer")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();

    const companyName = (settingsRow as any)?.company_name ?? "";
    const companyPhone = (settingsRow as any)?.company_phone ?? "";

    // 3. Format date
    let scheduledDate = "TBC";
    if (job.scheduled_date) {
      const d = new Date(`${job.scheduled_date}T12:00:00`);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      scheduledDate = `${dd}/${mm}/${yyyy}`;
    }

    const timeSlot = job.time_block || "TBC";

    // 4. First name
    const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

    // 5. Normalise phone
    let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) phone = "353" + phone.substring(1);

    // 6. Build message
    const confirmedWith = companyName ? ` with ${companyName}` : "";
    const signoff = [companyName, companyPhone].filter(Boolean).join(" ☎ ");
    const message =
      `Hi ${firstName}, your booking${confirmedWith} is confirmed.\n\n` +
      `📅 Date: ${scheduledDate}\n` +
      `⏰ Time: ${timeSlot}\n` +
      `👷 Engineer: ${engineerName}\n\n` +
      `If you need to make any changes please reply to this message.${signoff ? `\n\n${signoff}` : ""}`;

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
          message_type: "schedule_confirmation",
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

    // 9. Mark sent
    await supabase
      .from("service_calls")
      .update({ schedule_confirmation_sent: true })
      .eq("id", service_call_id);

    return json({ success: true });
  } catch (e) {
    console.error("send-schedule-confirmation error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
