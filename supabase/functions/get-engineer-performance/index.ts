import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireCallerOrg } from "../_shared/orgAuth.ts";

/**
 * Engineer Job Performance report (office/admin only).
 *
 * Deliberately isolated from get-business-insights — nothing here reads or
 * changes that function's data or calculations.
 *
 * IMPLEMENTATION NOTES
 * --------------------
 * 1. COST / GROSS PROFIT IS DEFERRED (confirmed blocker).
 *    The schema has no reliable cost source for a completed job:
 *      - service_calls has revenue only, no cost column;
 *      - quotes.net_cost exists but is populated on 0 rows and only covers
 *        quoted work;
 *      - parts_requests.actual_cost is populated on 1 row and is parts-only.
 *    Rather than invent a financial model, every cost/GP figure is returned as
 *    null and the UI renders "—". `cost_source: "unavailable"` tells the client
 *    this is a missing-source state, not a €0 result.
 *
 * 2. SKEW THRESHOLD (deterministic).
 *    A period is flagged as skewed when the engineer has >= 2 completed jobs
 *    AND the single largest completed job accounts for >= 60% of that
 *    engineer's period revenue. Never flagged on 1 completed job. Because GP is
 *    unavailable the skew is measured on revenue, and the client labels it
 *    accordingly ("Revenue skewed by 1 large job").
 *
 * 3. MULTI-ENGINEER JOBS ARE OUT OF SCOPE (V1 limitation).
 *    Attribution uses service_calls.assigned_engineer_id only. Assists in
 *    job_engineers are ignored — a job counts entirely for its lead engineer.
 *    No revenue/cost/GP/count splitting happens here.
 */

const COMPLETED_STATUSES = ["Completed", "completed"];
const IN_PROGRESS_STATUSES = ["En Route", "On Site", "In Progress"];
const SKEW_MIN_JOBS = 2;
const SKEW_SHARE = 0.6;

type PeriodType = "week" | "month";

/** Europe/Dublin calendar day for an instant (project-wide convention). */
function dublinParts(d: Date) {
  const s = d.toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }); // YYYY-MM-DD
  const [y, m, day] = s.split("-").map(Number);
  return { y, m, day };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Inclusive period bounds as Dublin calendar dates (Monday-start weeks). */
function periodBounds(periodType: PeriodType, anchor: Date) {
  const { y, m, day } = dublinParts(anchor);
  if (periodType === "month") {
    const end = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last of this
    return { start: iso(y, m, 1), end: iso(y, m, end.getUTCDate()) };
  }
  const base = new Date(Date.UTC(y, m - 1, day));
  const dow = base.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  const startD = new Date(base.getTime() - back * 86400000);
  const endD = new Date(startD.getTime() + 6 * 86400000);
  return {
    start: startD.toISOString().slice(0, 10),
    end: endD.toISOString().slice(0, 10),
  };
}

/** Job type buckets shown in the mix bar. */
function bucket(jobType: string | null): "service" | "repair" | "install" | "other" {
  const t = (jobType || "").toLowerCase();
  if (t.includes("install") || t.includes("replacement") || t.includes("upgrade")) return "install";
  if (t.includes("repair") || t.includes("emergency") || t.includes("fault")) return "repair";
  if (t.includes("service") || t.includes("boiler")) return "service";
  return "other";
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Caller org is derived server-side; any organisation_id in the body is ignored.
    const access = await requireCallerOrg(req, {
      fnName: "get-engineer-performance",
      cors: corsHeaders,
    });
    if (isDenied(access)) return access.error;
    const orgId = access.orgId;

    if (access.kind === "user") {
      const role = (access.role || "").toLowerCase();
      if (!["office", "admin", "owner", "superadmin"].includes(role)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    let body: { period_type?: string; anchor_date?: string } = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const periodType: PeriodType = body.period_type === "month" ? "month" : "week";
    const anchor =
      typeof body.anchor_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.anchor_date)
        ? new Date(`${body.anchor_date}T12:00:00`)
        : new Date();

    const { start, end } = periodBounds(periodType, anchor);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const [engineersRes, completedRes, cancelledRes, activeRes] = await Promise.all([
      supabase
        .from("engineers")
        .select("id, name, status")
        .eq("organisation_id", orgId)
        .neq("status", "deactivated")
        .order("name"),
      supabase
        .from("service_calls")
        .select("id, assigned_engineer_id, revenue, job_type, completed_at")
        .eq("organisation_id", orgId)
        .in("status", COMPLETED_STATUSES)
        .gte("completed_at", `${start}T00:00:00+00:00`)
        .lte("completed_at", `${end}T23:59:59+00:00`),
      supabase
        .from("service_calls")
        .select("id, assigned_engineer_id, scheduled_date")
        .eq("organisation_id", orgId)
        .eq("status", "Cancelled")
        .gte("scheduled_date", start)
        .lte("scheduled_date", end),
      supabase
        .from("service_calls")
        .select("id, assigned_engineer_id, status, scheduled_date")
        .eq("organisation_id", orgId)
        .in("status", IN_PROGRESS_STATUSES),
    ]);

    if (engineersRes.error) throw engineersRes.error;

    const engineers = engineersRes.data ?? [];
    const completed = completedRes.data ?? [];
    const cancelled = cancelledRes.data ?? [];
    const active = activeRes.data ?? [];

    const perEngineer = engineers.map((eng: any) => {
      const jobs = completed.filter((j: any) => j.assigned_engineer_id === eng.id);
      const revenue = jobs.reduce((a: number, j: any) => a + (Number(j.revenue) || 0), 0);
      const revenues = jobs.map((j: any) => Number(j.revenue) || 0);
      const largest = revenues.length ? Math.max(...revenues) : 0;

      const mix = { service: 0, repair: 0, install: 0, other: 0 };
      jobs.forEach((j: any) => {
        mix[bucket(j.job_type)] += 1;
      });

      const cancelledCount = cancelled.filter(
        (j: any) => j.assigned_engineer_id === eng.id,
      ).length;

      const activeJob = active.find((j: any) => j.assigned_engineer_id === eng.id) || null;

      const skewed =
        jobs.length >= SKEW_MIN_JOBS && revenue > 0 && largest / revenue >= SKEW_SHARE;

      return {
        engineer_id: eng.id,
        name: eng.name,
        completed_jobs: jobs.length,
        cancelled_jobs: cancelledCount,
        revenue,
        // Cost source unavailable — see note 1. Never fabricate €0.
        cost: null as number | null,
        gross_profit: null as number | null,
        gp_pct: null as number | null,
        job_mix: mix,
        active_job: activeJob
          ? { status: activeJob.status, since: activeJob.scheduled_date }
          : null,
        skewed_by_large_job: skewed,
      };
    });

    const teamRevenue = perEngineer.reduce((a, e) => a + e.revenue, 0);
    const teamJobs = perEngineer.reduce((a, e) => a + e.completed_jobs, 0);

    return json({
      period: { type: periodType, start, end },
      // Weighted team margin would be total GP / total revenue — held back
      // until a cost source exists (see note 1).
      cost_source: "unavailable",
      team: {
        total_jobs: teamJobs,
        revenue: teamRevenue,
        gross_profit: null,
        gp_pct: null,
        cancelled_jobs: cancelled.length,
      },
      engineers: perEngineer,
      skew_rule: {
        min_completed_jobs: SKEW_MIN_JOBS,
        share_threshold: SKEW_SHARE,
        measured_on: "revenue",
      },
      limitations: {
        multi_engineer_attribution:
          "Whole job attributed to service_calls.assigned_engineer_id; job_engineers assists ignored in V1.",
        gross_profit:
          "No reliable job cost source in the schema — GP, GP% and margin health are unavailable.",
      },
    });
  } catch (e) {
    console.error("get-engineer-performance failed", e);
    return json({ error: "Failed to build engineer performance report" }, 500);
  }
});
