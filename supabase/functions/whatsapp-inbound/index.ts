import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgBrandingClient } from "../_shared/orgBranding.ts";
import { getWhatsAppConfig, normalisePhone, logWhatsAppFailure } from "../_shared/whatsapp.ts";
import { businessToday, parseInboundIntent, pickActingOrg, resolveInboundSender, resolveReplyTarget } from "../_shared/cancelIntent.ts";
import { last9Digits, samePhone } from "../_shared/phone.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  const earlyResponse = new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  let payload: any = null;
  try {
    payload = await req.json();
  } catch (e) {
    console.error("Failed to parse webhook body:", e);
    return earlyResponse;
  }

  console.log("360Messenger webhook received:", JSON.stringify(payload));

  // Only process inbound chat or file messages
  if (payload?.dataType !== "message") {
    console.log("Non-message event, ignoring:", payload?.dataType);
    return earlyResponse;
  }

  const from = payload?.From ?? "";
  const messageText = payload?.Chat || payload?.Caption || "[non-text message]";
  const createdAt = payload?.createdAt
    ? new Date(payload.createdAt).toISOString()
    : new Date().toISOString();

  console.log(`Inbound from ${from}: ${messageText}`);

  // A phone number can sit on SEVERAL customer records (shared household
  // numbers, duplicates). Fetch them all — picking only the newest used to hide
  // the reminded job when it belonged to a sibling record.
  const key = last9Digits(from);
  const { data: candidateCustomers } = await supabase
    .from("customers")
    .select("id, organisation_id, name, phone, landline_phone, created_at")
    .or(`phone.ilike.%${key},landline_phone.ilike.%${key}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const sender = key
    ? resolveInboundSender(from, candidateCustomers ?? [], samePhone)
    : ({ action: "drop", reason: "no_match" } as const);

  if (sender.action === "drop") {
    console.error(
      `Inbound WhatsApp from ${from} dropped (${sender.reason}) — no safe customer/organisation match. Body: ${messageText}`,
    );
    return earlyResponse;
  }

  const inboundOrgId = sender.logging_organisation_id;
  const customer = sender.primary;
  const senderCustomerIds = sender.customers.map((c) => c.id);
  // Where replies/notifications/activity are written. Defaults to the newest
  // record's org (previous behaviour) and is narrowed to the org that actually
  // owns the reminded job once CONFIRM/CANCEL candidates are known.
  let actingOrgId = inboundOrgId;
  if (sender.customers.length > 1) {
    console.log(
      `Inbound ${from} matches ${sender.customers.length} customer records across ${sender.orgs.length} org(s): ${senderCustomerIds.join(", ")}`,
    );
  }


  await supabase.from("whatsapp_messages").insert({
    organisation_id: inboundOrgId,
    customer_id: customer?.id ?? null,
    message_body: messageText,
    message_type: "Inbound Reply",
    sent_by: "customer",
    status: "Received",
    customer_reply: messageText,
    reply_received_at: createdAt,
    sent_at: createdAt,
  });

  // Mirror inbound to message_log so it appears in Chat Inbox History
  try {
    await supabase.from("message_log").insert({
      organisation_id: inboundOrgId,
      customer_id: customer?.id ?? null,
      message_type: "inbound",
      channel: "whatsapp",
      direction: "inbound",
      content: messageText,
      status: "received",
      sent_by: "customer",
      sent_at: createdAt,
    });
  } catch (_e) {
    console.error("Failed to log inbound message_log:", _e);
  }


  // Send a WhatsApp reply to the inbound sender. Never throws.
  async function sendReply(text: string, messageType: string) {
    try {
      const { apiKey } = await getWhatsAppConfig(supabase, actingOrgId);
      if (!from) return;
      const form = new FormData();
      form.append("phonenumber", normalisePhone(from));
      form.append("text", text);
      await fetch("https://api.360messenger.com/v2/sendMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      await supabase.from("message_log").insert({
        organisation_id: actingOrgId,
        customer_id: customer?.id ?? null,
        message_type: messageType,
        channel: "whatsapp",
        direction: "outbound",
        content: text,
        status: "sent",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`Failed to send ${messageType}:`, msg);
      await logWhatsAppFailure(supabase, {
        organisation_id: actingOrgId,
        customer_id: customer?.id ?? null,
        message_type: messageType,
        content: text,
        sent_by: "system",
        error_message: msg,
      });
    }
  }

  async function logActivity(label: string, serviceCallId: string | null, customerId?: string | null) {
    try {
      await supabase.from("customer_activity").insert({
        organisation_id: actingOrgId,
        customer_id: customerId ?? customer?.id ?? null,
        service_call_id: serviceCallId,
        event_type: "whatsapp_received",
        event_label: label,
      });
    } catch (_e) {
      console.error("Failed to log customer_activity:", _e);
    }
  }

  // Raise an in-app notification for this org's office/admin staff.
  async function notifyStaff(
    title: string,
    body: string,
    jobId: string | null,
    metadata: Record<string, unknown>,
  ) {
    try {
      const { data: staff } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organisation_id", actingOrgId)
        .in("role", ["office", "admin"])
        .eq("is_active", true);

      const rows = (staff ?? [])
        .filter((s: any) => !!s?.user_id)
        .map((s: any) => ({
          recipient_user_id: s.user_id,
          organisation_id: actingOrgId,
          notification_type: "whatsapp_reply",
          title,
          body,
          role: "office",
          job_id: jobId,
          is_read: false,
          metadata,
        }));
      if (rows.length > 0) await supabase.from("notifications").insert(rows);
    } catch (_e) {
      console.error("Failed to notify staff:", _e);
    }
  }

  if (customer?.id) {
    await supabase
      .from("customers")
      .update({ last_message_sent_at: createdAt })
      .in("id", senderCustomerIds);

    const intent = parseInboundIntent(messageText);

    if (intent === "stop") {
      await supabase
        .from("customers")
        .update({
          opted_out: true,
          opted_out_date: createdAt.slice(0, 10),
          whatsapp_opt_in: false,
          whatsapp_reminders_enabled: false,
          whatsapp_opt_out_at: createdAt,
          whatsapp_opt_out_source: "inbound_stop",
          last_reminder_response: "stop",
        })
        .in("id", senderCustomerIds);

      const branding = await getOrgBrandingClient(supabase, inboundOrgId);
      await sendReply(
        `Got it — we've removed you from our reminder list. No further messages will be sent. ${branding.footer || branding.name}.`,
        "opt_out_reply",
      );
      return earlyResponse;
    }

    if (intent === "confirm" || intent === "cancel") {
      // Candidate jobs for EVERY record sharing the number. Date/ambiguity and
      // org-choice rules live in the pure resolvers so they are unit-tested.
      const { data: jobs } = await supabase
        .from("service_calls")
        .select("id, status, scheduled_date, time_block, organisation_id, reminder_2day_sent, customer_id")
        .in("customer_id", senderCustomerIds)
        .eq("reminder_2day_sent", true)
        .order("scheduled_date", { ascending: true });

      const today = businessToday();
      const orgChoice = pickActingOrg(jobs ?? [], today);
      if (orgChoice.action === "drop" && orgChoice.reason === "cross_org_ambiguous") {
        console.error(
          `Inbound ${intent} from ${from}: eligible jobs in more than one organisation — refusing to guess. Job ids: ${(jobs ?? []).map((j: any) => j.id).join(", ")}`,
        );
        return earlyResponse;
      }
      if (orgChoice.action === "act") actingOrgId = orgChoice.organisation_id;

      const branding = await getOrgBrandingClient(supabase, actingOrgId);
      const callUs = branding.phone ? ` on ${branding.phone}` : "";

      const decision = resolveReplyTarget(
        orgChoice.action === "act" ? orgChoice.jobs : [],
        today,
      );
      const customerName = (customer as any).name || "customer";
      const ownerName = (jobId: string | null) => {
        const j = (jobs ?? []).find((x: any) => x.id === jobId);
        const owner = sender.customers.find((c) => c.id === (j as any)?.customer_id);
        return owner?.name || customerName;
      };

      // No upcoming reminded booking — tell them rather than dropping silently.
      if (decision.action === "none") {
        await sendReply(
          `Thanks — we couldn't match that to an upcoming appointment. Please call us${callUs} and we'll help.`,
          "reply_unmatched",
        );
        await logActivity(
          `WhatsApp reply "${intent.toUpperCase()}" — no matching upcoming job`,
          null,
        );
        console.log(`Inbound ${intent} from customer ${customer.id}: no eligible job`);
        return earlyResponse;
      }

      // Two or more upcoming bookings — never guess which one. Escalate.
      if (decision.action === "escalate") {
        const soonest = decision.jobs[0];
        await sendReply(
          `Thanks — you have more than one upcoming appointment with us, so we don't want to change the wrong one. Please call us${callUs} and we'll sort it straight away.`,
          "reply_ambiguous",
        );
        await notifyStaff(
          intent === "cancel" ? "WhatsApp cancel needs action" : "WhatsApp confirm needs action",
          `${ownerName(soonest.id)} replied ${intent.toUpperCase()} but has ${decision.jobs.length} upcoming appointments — please call them back.`,
          soonest.id,
          {
            customer_id: (soonest as any).customer_id ?? customer.id,
            intent,
            reason: decision.reason,
            candidate_job_ids: decision.jobs.map((j) => j.id),
          },
        );
        try {
          await supabase
            .from("service_calls")
            .update({
              follow_up_needed: true,
              follow_up_detail:
                `Customer replied ${intent.toUpperCase()} by WhatsApp but has ${decision.jobs.length} upcoming appointments — confirm which one by phone.`,
              follow_up_resolved: false,
            })
            .eq("id", soonest.id);
        } catch (_e) {
          console.error("Failed to flag follow-up:", _e);
        }
        await logActivity(
          `WhatsApp reply "${intent.toUpperCase()}" — ambiguous (${decision.jobs.length} upcoming jobs), escalated to office`,
          soonest.id,
          (soonest as any).customer_id ?? customer.id,
        );
        return earlyResponse;
      }

      // Exactly one match — safe to act.
      const job = decision.job;
      const jobOwnerId = (job as any).customer_id ?? customer.id;
      const jobOwnerName = ownerName(job.id);

      if (intent === "confirm") {
        await supabase
          .from("service_calls")
          .update({ confirmed: true, confirmed_at: new Date().toISOString() })
          .eq("id", job.id);
        await sendReply(
          `Thanks ${jobOwnerName}, your appointment is confirmed. See you then! ${branding.footer || branding.name}`,
          "reply_confirmed",
        );
        await logActivity("WhatsApp received — Appointment Confirmed", job.id, jobOwnerId);
      } else {
        await supabase
          .from("service_calls")
          .update({
            status: "Cancelled",
            cancellation_reason: "Customer cancelled via WhatsApp",
            cancelled_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        await sendReply(
          `Thanks ${jobOwnerName}, your appointment has been cancelled. To rebook please call us${callUs}. ${branding.footer || branding.name}`,
          "reply_cancelled",
        );
        await notifyStaff(
          "Job cancelled by customer",
          `${jobOwnerName} cancelled their appointment by WhatsApp reply.`,
          job.id,
          { customer_id: jobOwnerId, intent, service_call_id: job.id },
        );
        await logActivity("WhatsApp received — Appointment Cancelled", job.id, jobOwnerId);
      }
      return earlyResponse;
    }
  }

  return earlyResponse;
});
