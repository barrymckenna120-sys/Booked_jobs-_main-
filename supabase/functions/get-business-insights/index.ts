import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Service-role client for queries
    const supabase = createClient(supabaseUrl, serviceKey);

    // Date helpers
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const addDays = (d: Date, n: number) =>
      new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    const in30 = addDays(today, 30);
    const in31 = addDays(today, 31);
    const in60 = addDays(today, 60);
    const in61 = addDays(today, 61);
    const in90 = addDays(today, 90);

    // ---- OVERVIEW ----
    const [
      totalCustomersRes,
      jobsCompletedThisMonthRes,
      revenueThisMonthRes,
      outstandingRes,
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", false)
        .eq("is_archived", false),
      supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .eq("status", "Completed")
        .gte("completed_at", startOfMonth),
      supabase
        .from("service_calls")
        .select("revenue")
        .eq("payment_status", "paid")
        .gte("paid_at", startOfMonth),
      supabase
        .from("service_calls")
        .select("revenue, balance_due")
        .neq("payment_status", "paid")
        .eq("status", "Completed"),
    ]);

    const sum = (rows: any[] | null, key: string) =>
      (rows ?? []).reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);

    const overview = {
      total_customers: totalCustomersRes.count ?? 0,
      jobs_completed_this_month: jobsCompletedThisMonthRes.count ?? 0,
      revenue_this_month: sum(revenueThisMonthRes.data as any[], "revenue"),
      outstanding_invoices_count: (outstandingRes.data ?? []).length,
      outstanding_invoices_value: sum(outstandingRes.data as any[], "revenue"),
    };

    // ---- RETENTION ----
    const [due30, due60, due90, dueNull, optedOut] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", false)
        .eq("is_archived", false)
        .gte("next_service_due", todayStr)
        .lte("next_service_due", in30),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", false)
        .eq("is_archived", false)
        .gte("next_service_due", in31)
        .lte("next_service_due", in60),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", false)
        .eq("is_archived", false)
        .gte("next_service_due", in61)
        .lte("next_service_due", in90),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", false)
        .is("next_service_due", null),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", true),
    ]);

    const retention = {
      due_next_30_days: due30.count ?? 0,
      due_31_60_days: due60.count ?? 0,
      due_61_90_days: due90.count ?? 0,
      no_next_service_due: dueNull.count ?? 0,
      opted_out: optedOut.count ?? 0,
    };

    // ---- AT RISK BUCKETS (within 90 days) ----
    const within90 = await supabase
      .from("customers")
      .select("id, next_service_due, last_reminder_sent, reminder_30_days_sent, reminder_7_days_sent")
      .eq("opted_out", false)
      .eq("is_archived", false)
      .gte("next_service_due", todayStr)
      .lte("next_service_due", in90);

    let green = 0;
    let amber = 0;
    for (const c of within90.data ?? []) {
      const reminderSent =
        !!c.last_reminder_sent || c.reminder_30_days_sent === true || c.reminder_7_days_sent === true;
      if (reminderSent) green++;
      else amber++;
    }

    return json({
      overview,
      retention,
      at_risk: { green, amber },
      generated_at: new Date().toISOString(),
    });
  } catch (_e) {
    const message = _e instanceof Error ? _e.message : "Internal error";
    return json({ error: message }, 500);
  }
});
