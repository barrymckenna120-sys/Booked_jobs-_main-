import { createClient } from "npm:@supabase/supabase-js@2";
import { filterDueCustomers } from "../_shared/renewalDedup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const organisation_id = body?.organisation_id;
    if (!organisation_id) {
      return new Response(
        JSON.stringify({ error: "organisation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() + 28);
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 32);
    const startDate = rangeStart.toISOString().split("T")[0];
    const endDate = rangeEnd.toISOString().split("T")[0];

    // Get customers due in 28-32 days who haven't opted out
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, next_service_due, organisation_id, address, eircode, area_code, boiler_brand, boiler_model, reminder_30_days_sent, reminder_14_days_sent")
      .eq("organisation_id", organisation_id)
      .gte("next_service_due", startDate)
      .lte("next_service_due", endDate)
      .neq("opted_out", true);

    if (custErr) throw custErr;
    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-org tenant integration cache
    const orgConfigCache = new Map<string, { tallyUrl: string; countryCode: string }>();
    const loadOrgConfig = async (orgId: string) => {
      if (orgConfigCache.has(orgId)) return orgConfigCache.get(orgId)!;

      const { data: tallyIntegration } = await supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", orgId)
        .eq("integration_type", "tally")
        .maybeSingle();

      const { data: messengerIntegration } = await supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", orgId)
        .eq("integration_type", "360messenger")
        .maybeSingle();

      if (!tallyIntegration || !messengerIntegration) {
        try {
          await supabase.from("edge_function_logs").insert({
            function_name: "30-day-reminder",
            error_message: `Missing tenant_integration rows for org ${orgId} — using fallbacks`,
            payload: { organisation_id: orgId, tally_found: !!tallyIntegration, messenger_found: !!messengerIntegration },
          });
        } catch (_e) { /* best-effort */ }
      }

      const cfg = {
        tallyUrl: (tallyIntegration as any)?.config?.renewal_form_url ?? "https://tally.so/r/RGJDy4",
        countryCode: String((messengerIntegration as any)?.config?.country_code ?? "353"),
      };
      orgConfigCache.set(orgId, cfg);
      return cfg;
    };

    const customerIds = customers.map((c) => c.id);
    const todayStr = today.toISOString().split("T")[0];
    const { data: bookedJobs, error: jobErr } = await supabase
      .from("service_calls")
      .select("customer_id")
      .in("customer_id", customerIds)
      .in("status", ["Pending", "pending", "Booked", "booked", "Confirmed", "confirmed", "Scheduled"])
      .gte("scheduled_date", todayStr);

    if (jobErr) throw jobErr;

    const bookedSet = new Set((bookedJobs || []).map((j) => j.customer_id));

    // Get most recent service_call per customer for payment_status and reminder flag
    const { data: recentJobs, error: recentErr } = await supabase
      .from("service_calls")
      .select("id, customer_id, payment_status, reminder_30day_sent, reminder_14day_sent")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (recentErr) throw recentErr;

    const latestJobMap = new Map<string, { id: string; payment_status: string; reminder_30day_sent: boolean; reminder_14day_sent: boolean }>();
    for (const job of recentJobs || []) {
      if (!latestJobMap.has(job.customer_id)) {
        latestJobMap.set(job.customer_id, {
          id: job.id,
          payment_status: job.payment_status || "unpaid",
          reminder_30day_sent: job.reminder_30day_sent ?? false,
          reminder_14day_sent: job.reminder_14day_sent ?? false,
        });
      }
    }

    const filtered = customers
      .filter((c) => !bookedSet.has(c.id))
      .filter((c) => {
        const latest = latestJobMap.get(c.id);
        return !latest || !latest.reminder_30day_sent;
      });

    const result = [];
    for (const c of filtered) {
      const latest = latestJobMap.get(c.id);
      const orgId = (c as any).organisation_id;
      const { tallyUrl, countryCode } = await loadOrgConfig(orgId);

      let digits = (c.phone || "").replace(/\D/g, "");
      const ccLen = countryCode.length;
      if (countryCode && digits.startsWith(countryCode) && digits.length === 9 + ccLen) {
        // already full international
      } else if (digits.startsWith("0") && digits.length === 10) {
        digits = countryCode + digits.slice(1);
      } else if (digits.length === 9) {
        digits = countryCode + digits;
      }
      const localPhone = "0" + digits.slice(ccLen);
      const full_tally_url = `${tallyUrl}` +
        `?Customer=${encodeURIComponent(c.name || "")}` +
        `&Mobile=${localPhone}` +
        `&Address=${encodeURIComponent((c as any).address || "")}` +
        `&Eircode=${encodeURIComponent((c as any).eircode || "")}` +
        `&Areacode=${encodeURIComponent((c as any).area_code || "")}` +
        `&Boiler_Brand=${encodeURIComponent((c as any).boiler_brand || "")}` +
        `&Boiler_model=${encodeURIComponent((c as any).boiler_model || "")}`;

      let tally_url = full_tally_url;
      try {
        const shortRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-booking-link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ customer_id: c.id, full_url: full_tally_url, organisation_id: orgId }),
        });
        const shortJson = await shortRes.json();
        console.log(`[create-booking-link] customer=${c.id} status=${shortRes.status} body=${JSON.stringify(shortJson)}`);
        if (shortJson?.short_url) tally_url = shortJson.short_url;
      } catch (_e) { /* fall back to full url */ }
      const d = new Date(c.next_service_due);
      const next_service_due_formatted = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
      result.push({
        customer_id: c.id,
        customer_name: c.name,
        customer_first_name: (c.name || "Customer").split(" ")[0],
        customer_phone: c.phone,
        next_service_due: c.next_service_due,
        next_service_due_formatted,
        payment_status: latest?.payment_status || "unpaid",
        job_id: latest?.id || null,
        reminder_30day_sent: latest?.reminder_30day_sent ?? false,
        reminder_14day_sent: latest?.reminder_14day_sent ?? false,
        tally_url,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from('edge_function_logs').insert({
        function_name: '30-day-reminder',
        error_message: err instanceof Error ? err.message : String(err),
        payload: null,
      });
    } catch (_) { /* best-effort */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
