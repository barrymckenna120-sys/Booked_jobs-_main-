import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller } from "../_shared/machineAuth.ts";
import { fetchWhatsappApiKey } from "../_shared/whatsappCredentials.ts";
import { normalisePhone } from "../_shared/whatsapp.ts";
import { getCanonicalOrgBranding } from "../_shared/orgBranding.ts";
import { evaluateOptOut } from "../_shared/optOut.ts";
import { logMessage } from "../_shared/logMessage.ts";
import {
  buildWarrantyWelcome,
  firstNameOf,
  isInstallJob,
  lookupWarrantyYears,
  type BoilerBrandRow,
} from "../_shared/warrantyWelcome.ts";

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
  | { phone: string; message: string; apiKey: string; customerId: string };

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
      .select("id, organisation_id, customer_id, job_type, completed_at")
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

    if (job.completed_at) {
      const ageMs = Date.now() - new Date(job.completed_at).getTime();
      if (ageMs > TOO_OLD_DAYS * 86400000) return { skip: "too_old" };
    }

    const customerId = row.customer_id || job.customer_id;
    if (!customerId) return { skip: "customer_not_found" };
    const { data: cust, error: custErr } = await sb
      .from("customers")
      .select("id, name, phone, opted_out, boiler_brand, boiler_model, boiler_make_model, warranty_years, warranty_expiry_date")
      .eq("id", customerId)
      .eq("organisation_id", org)
      .maybeSingle();
    if (custErr) throw new Error(`customers read failed: ${custErr.message}`);
    if (!cust) return { skip: "customer_not_found" };
    const opt = evaluateOptOut(cust);
    if (opt.skip) return { skip: opt.reason === "customer_opted_out" ? "opted_out" : opt.reason === "no_phone_number" ? "no_phone" : opt.reason };
    const phone = normalisePhone(String(cust!.phone));
    if (!phone) return { skip: "no_phone" };

    const wa = await fetchWhatsappApiKey(SUPABASE_URL, SERVICE_KEY, org);
    if (!wa.apiKey) return { skip: "no_whatsapp_key" };

    const branding = await getCanonicalOrgBranding(sb, org);
    if (!branding.org_name) return { skip: "no_tenant_name" };

    const expiry = cust!.warranty_expiry_date ?? null;
    // Only look up boiler_brands years when a valid future expiry date doesn't apply.
    const expiryApplies = futureExpiryClause(expiry, todayDublin()) !== null;
    let years: number | null = null;
    if (!expiryApplies) {
      years = cust!.warranty_years ?? null;
      if (years == null) {
        const makeModel = [cust!.boiler_brand, cust!.boiler_model].filter(Boolean).join(" ") || cust!.boiler_make_model || "";
        if (makeModel) {
          const { data: brands, error: brandErr } = await sb.from("boiler_brands").select("brand_name, model_name, warranty_years, is_default");
          if (brandErr) throw new Error(`boiler_brands read failed: ${brandErr.message}`);
          years = lookupWarrantyYears(makeModel, (brands || []) as BoilerBrandRow[]);
        }
      }
    }

    const message = buildWarrantyWelcome({
      firstName: firstNameOf(cust!.name),
      tenantName: branding.org_name,
      brand: cust!.boiler_brand,
      model: cust!.boiler_model,
      warrantyYears: years,
      warrantyExpiry: expiry,
      tenantPhone: branding.org_phone,
      footer: branding.footer && branding.footer !== branding.org_name ? branding.footer : "",
    });
    return { phone, message, apiKey: wa.apiKey, customerId: cust!.id };
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
        results.push("skip" in p
          ? { id: row.id, status: "would_skip", reason: p.skip }
          : { id: row.id, status: "would_send", reason: null, message: p.message });
      }
      return json({ processed: results.length, sent: 0, skipped: 0, failed: 0, dry_run: true, results });
    }

    // Rows whose 10-minute sending lease expired: never resend, mark failed.
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

    let sent = 0, skipped = 0, failed = 0;
    const results: Array<{ id: string; status: string; reason: string | null }> = [];

    for (const row of (claimed || []) as QueueRow[]) {
      let p: Prepared;
      try {
        p = await prepare(row);
      } catch (e) {
        p = { skip: "" };
        const reason = `prepare_error: ${(e as Error)?.message ?? e}`;
        const final = row.attempts >= MAX_ATTEMPTS;
        await sb.from("post_payment_messages").update({
          status: final ? "failed" : "pending",
          not_before: new Date(Date.now() + 30 * 60000).toISOString(),
          last_error: reason.slice(0, 500),
        }).eq("id", row.id).eq("status", "sending");
        await logFn(row.organisation_id, reason, { queue_id: row.id, service_call_id: row.service_call_id });
        final ? failed++ : null;
        results.push({ id: row.id, status: final ? "failed" : "pending", reason });
        continue;
      }

      if ("skip" in p) {
        await sb.from("post_payment_messages").update({ status: "skipped", last_error: p.skip })
          .eq("id", row.id).eq("status", "sending");
        skipped++;
        results.push({ id: row.id, status: "skipped", reason: p.skip });
        continue;
      }

      const form = new FormData();
      form.append("phonenumber", p.phone);
      form.append("text", p.message);
      let ok = false;
      let errText = "";
      try {
        const res = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${p.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(15000),
        });
        const txt = await res.text();
        ok = res.ok;
        if (!ok) errText = `HTTP ${res.status}: ${txt.slice(0, 200)}`;
      } catch (e) {
        errText = `network: ${(e as Error)?.message ?? e}`;
      }

      if (ok) {
        await sb.from("post_payment_messages").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id).eq("status", "sending");
        await logMessage(sb, {
          organisation_id: row.organisation_id,
          customer_id: p.customerId,
          message_type: "warranty_welcome",
          content: p.message,
          status: "sent",
          channel: "whatsapp",
          recipient_phone: `+${p.phone}`,
        });
        try {
          await sb.from("customer_activity").insert({
            organisation_id: row.organisation_id,
            customer_id: p.customerId,
            service_call_id: row.service_call_id,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Warranty welcome",
            event_data: { message_type: "warranty_welcome" },
          });
        } catch (_e) {
          // non-critical
        }
        await logFn(row.organisation_id, "OK", { queue_id: row.id, service_call_id: row.service_call_id });
        sent++;
        results.push({ id: row.id, status: "sent", reason: null });
      } else {
        const final = row.attempts >= MAX_ATTEMPTS;
        await sb.from("post_payment_messages").update({
          status: final ? "failed" : "pending",
          not_before: new Date(Date.now() + 30 * 60000).toISOString(),
          last_error: errText.slice(0, 500),
        }).eq("id", row.id).eq("status", "sending");
        await logFn(row.organisation_id, `SEND_FAILED: ${errText}`, {
          queue_id: row.id,
          service_call_id: row.service_call_id,
          attempts: row.attempts,
        });
        if (final) failed++;
        results.push({ id: row.id, status: final ? "failed" : "pending", reason: errText });
      }
    }

    return json({ processed: results.length, sent, skipped, failed, dry_run: false, results });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logFn(null, `ERROR: ${msg}`, {});
    return json({ error: msg }, 500);
  }
});
