import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller } from "../_shared/machineAuth.ts";
import { installDateOf, isInstallJob } from "../_shared/installJob.ts";

// warranty_welcome rows no longer send WhatsApp. They set the customer's
// boiler_installation_date so the existing warranty-auto-send reminders fire.
const FN = "process-post-payment-messages";
const MAX_ATTEMPTS = 3;
const TOO_OLD_DAYS = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QueueRow = {
  id: string;
  organisation_id: string;
  service_call_id: string;
  customer_id: string | null;
  message_type: string;
  status: string;
  attempts: number;
};

type Prepared =
  | { skip: string }
  | { customerId: string; installDate: string; current: string | null; jobReference: string | null };

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireMachineCaller(req, corsHeaders, FN);
  if (denied) return denied;

  let body: { dry_run?: unknown; service_call_id?: unknown } = {};
  try {
    body = await req.json();
  } catch (_e) {
    body = {};
  }
  const dryRun = body?.dry_run === true;
  const scId = body?.service_call_id == null ? null : String(body.service_call_id);
  if (scId !== null && !UUID_RE.test(scId)) return json({ error: "service_call_id must be a UUID" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const logFn = async (orgId: string | null, msg: string, payload: Record<string, unknown>) => {
    try {
      await sb.from("edge_function_logs").insert({
        function_name: FN,
        error_message: msg.slice(0, 500),
        organisation_id: orgId,
        payload,
      });
    } catch (_e) {
      // non-critical
    }
  };

  // Everything below is scoped to row.organisation_id — no other org source.
  const prepare = async (row: QueueRow): Promise<Prepared> => {
    const org = row.organisation_id;
    const { data: job, error: jobErr } = await sb
      .from("service_calls")
      .select("id, organisation_id, customer_id, job_type, job_reference, completed_at, paid_at")
      .eq("id", row.service_call_id)
      .eq("organisation_id", org)
      .maybeSingle();
    if (jobErr) throw new Error(`service_calls read failed: ${jobErr.message}`);
    if (!job) return { skip: "job_not_found" };

    const { data: tagRows, error: tagErr } = await sb
      .from("service_call_tags")
      .select("job_tags(name)")
      .eq("service_call_id", job.id);
    if (tagErr) throw new Error(`service_call_tags read failed: ${tagErr.message}`);
    const tagNames = (tagRows || []).map((t: any) => t?.job_tags?.name ?? null);
    if (!isInstallJob(job, tagNames)) return { skip: "not_install" };

    const installDate = installDateOf(job);
    if (!installDate) return { skip: "no_install_date" };
    const ageMs = Date.now() - new Date(`${installDate}T12:00:00Z`).getTime();
    if (ageMs > TOO_OLD_DAYS * 86400000) return { skip: "too_old" };

    const customerId = row.customer_id || job.customer_id;
    if (!customerId) return { skip: "customer_not_found" };
    const { data: cust, error: custErr } = await sb
      .from("customers")
      .select("id, boiler_installation_date")
      .eq("id", customerId)
      .eq("organisation_id", org)
      .maybeSingle();
    if (custErr) throw new Error(`customers read failed: ${custErr.message}`);
    if (!cust) return { skip: "customer_not_found" };
    const current = cust.boiler_installation_date ? String(cust.boiler_installation_date).slice(0, 10) : null;
    return { customerId: cust.id, installDate, current, jobReference: job.job_reference ?? null };
  };

  try {
    // ── Dry run: read only, never claims or writes.
    if (dryRun) {
      let q = sb.from("post_payment_messages").select("*").eq("status", "pending").order("created_at").limit(25);
      q = scId ? q.eq("service_call_id", scId) : q.lte("not_before", new Date().toISOString());
      const { data: rows, error } = await q;
      if (error) throw new Error(`read failed: ${error.message}`);
      const results = [];
      for (const row of (rows || []) as QueueRow[]) {
        const p = await prepare(row);
        if ("skip" in p) {
          results.push({ id: row.id, status: "would_skip", reason: p.skip });
        } else {
          const willSet = p.current === null || p.current < p.installDate;
          results.push({
            id: row.id,
            status: willSet ? "would_set_install_date" : "would_leave_unchanged",
            install_date: p.installDate,
            current_install_date: p.current,
            customer_id: p.customerId,
          });
        }
      }
      return json({ processed: results.length, set: 0, unchanged: 0, skipped: 0, failed: 0, dry_run: true, results });
    }

    // Rows whose 10-minute lease expired: mark failed (retry is manual).
    const { data: stuck, error: stuckErr } = await sb
      .from("post_payment_messages")
      .update({ status: "failed", last_error: "stuck_in_sending" })
      .eq("status", "sending")
      .lt("not_before", new Date().toISOString())
      .select("id, organisation_id, service_call_id");
    if (stuckErr) throw new Error(`stuck sweep failed: ${stuckErr.message}`);
    for (const s of stuck || []) {
      await logFn(s.organisation_id, "STUCK_SENDING", { queue_id: s.id, service_call_id: s.service_call_id });
    }

    const { data: claimed, error: claimErr } = await sb.rpc("claim_post_payment_messages", {
      p_limit: 25,
      p_service_call_id: scId,
    });
    if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);

    let set = 0, unchanged = 0, skipped = 0, failed = 0;
    const results: Array<{ id: string; status: string; reason: string | null; install_date?: string }> = [];

    const retryOrFail = async (row: QueueRow, reason: string) => {
      const final = row.attempts >= MAX_ATTEMPTS;
      await sb.from("post_payment_messages").update({
        status: final ? "failed" : "pending",
        not_before: new Date(Date.now() + 30 * 60000).toISOString(),
        last_error: reason.slice(0, 500),
      }).eq("id", row.id).eq("status", "sending");
      await logFn(row.organisation_id, reason, { queue_id: row.id, service_call_id: row.service_call_id });
      if (final) failed++;
      results.push({ id: row.id, status: final ? "failed" : "pending", reason });
    };

    for (const row of (claimed || []) as QueueRow[]) {
      let p: Prepared;
      try {
        p = await prepare(row);
      } catch (e) {
        await retryOrFail(row, `prepare_error: ${(e as Error)?.message ?? e}`);
        continue;
      }

      if ("skip" in p) {
        await sb.from("post_payment_messages").update({ status: "skipped", last_error: p.skip })
          .eq("id", row.id).eq("status", "sending");
        skipped++;
        results.push({ id: row.id, status: "skipped", reason: p.skip });
        continue;
      }

      // Guarded, org-scoped write: only set when empty or earlier than this install.
      const { data: updated, error: updErr } = await sb
        .from("customers")
        .update({ boiler_installation_date: p.installDate })
        .eq("id", p.customerId)
        .eq("organisation_id", row.organisation_id)
        .or(`boiler_installation_date.is.null,boiler_installation_date.lt.${p.installDate}`)
        .select("id");
      if (updErr) {
        await retryOrFail(row, `customer_update_error: ${updErr.message}`);
        continue;
      }
      const didSet = (updated || []).length > 0;
      const outcome = didSet ? "install_date_set" : "install_date_unchanged";

      await sb.from("post_payment_messages").update({ status: "sent", sent_at: new Date().toISOString(), last_error: outcome })
        .eq("id", row.id).eq("status", "sending");

      if (didSet) {
        try {
          await sb.from("customer_activity").insert({
            organisation_id: row.organisation_id,
            customer_id: p.customerId,
            service_call_id: row.service_call_id,
            event_type: "install_date_set",
            event_label: `Boiler install date set from job ${p.jobReference ?? row.service_call_id}`,
            event_data: { install_date: p.installDate, previous: p.current },
          });
        } catch (_e) {
          // non-critical
        }
        set++;
      } else {
        unchanged++;
      }
      await logFn(row.organisation_id, outcome.toUpperCase(), {
        queue_id: row.id,
        service_call_id: row.service_call_id,
        install_date: p.installDate,
      });
      results.push({ id: row.id, status: "sent", reason: outcome, install_date: p.installDate });
    }

    return json({ processed: results.length, set, unchanged, skipped, failed, dry_run: false, results });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logFn(null, `ERROR: ${msg}`, {});
    return json({ error: msg }, 500);
  }
});
