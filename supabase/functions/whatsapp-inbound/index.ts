import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgBrandingClient } from "../_shared/orgBranding.ts";
import {
  getWhatsAppConfig,
  normalisePhone,
  logWhatsAppFailure,
} from "../_shared/whatsapp.ts";
import {
  businessToday,
  parseInboundIntent,
  pickActingOrg,
  resolveInboundSender,
  resolveReplyTarget,
} from "../_shared/cancelIntent.ts";
import { logCustomerAudit } from "../_shared/auditLog.ts";
import { last9Digits, samePhone } from "../_shared/phone.ts";
import {
  buildCancelUpdate,
  cancelAuditDetail,
  reversesConfirmation,
  WHATSAPP_CANCEL_REASON,
} from "../_shared/cancelUpdate.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  )!
);

/**
 * 360Messenger cannot send custom headers, so this webhook is authenticated
 * by a shared secret carried in the URL (?s=<WHATSAPP_INBOUND_SECRET>).
 *
 * Internal/machine callers with the Make secret or service-role key are also
 * accepted.
 *
 * Fail-closed: if WHATSAPP_INBOUND_SECRET is not configured the request is
 * rejected with 401. A missing required security variable must never disable
 * the guard.
 */
function bearerToken(
  req: Request
): string {
  const auth =
    req.headers.get(
      "authorization"
    ) ?? "";

  return auth.startsWith(
    "Bearer "
  )
    ? auth.slice(7).trim()
    : "";
}

function isMachineCaller(
  req: Request
): boolean {
  const expected =
    (
      Deno.env.get(
        "MAKE_WEBHOOK_SECRET"
      ) ?? ""
    ).trim();

  const provided =
    (
      req.headers.get(
        "x-webhook-secret"
      ) ??
      req.headers.get(
        "x-make-secret"
      ) ??
      ""
    ).trim();

  if (
    expected &&
    provided &&
    provided === expected
  ) {
    return true;
  }

  const serviceRoleKey =
    (
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      ) ?? ""
    ).trim();

  const token =
    bearerToken(req);

  return Boolean(
    serviceRoleKey &&
      token &&
      token === serviceRoleKey
  );
}

function isAuthorisedInbound(
  req: Request
): boolean {
  if (isMachineCaller(req)) {
    return true;
  }

  const expected =
    (
      Deno.env.get(
        "WHATSAPP_INBOUND_SECRET"
      ) ?? ""
    ).trim();

  if (!expected) {
    // Fail CLOSED: a missing required security env var must not disable the guard.
    console.error(
      "whatsapp-inbound: WHATSAPP_INBOUND_SECRET is not configured — rejecting request"
    );

    return false;
  }

  const provided =
    (
      new URL(req.url)
        .searchParams.get("s") ??
      ""
    ).trim();

  return provided === expected;
}

Deno.serve(
  async (req: Request) => {
    const earlyResponse =
      new Response(
        JSON.stringify({
          status: "ok",
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );

    if (
      !isAuthorisedInbound(req)
    ) {
      console.warn(
        "whatsapp-inbound: rejected call with missing/invalid secret"
      );

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    let payload: any =
      null;

    try {
      payload = await req.json();
    } catch (e) {
      console.error(
        "Failed to parse webhook body:",
        e
      );

      return earlyResponse;
    }

    console.log(
      "360Messenger webhook received:",
      JSON.stringify(payload)
    );

    // Only process inbound chat or file messages
    if (
      payload?.dataType !==
      "message"
    ) {
      console.log(
        "Non-message event, ignoring:",
        payload?.dataType
      );

      return earlyResponse;
    }

    const from =
      payload?.From ?? "";

    const messageText =
      payload?.Chat ||
      payload?.Caption ||
      "[non-text message]";

    const createdAt =
      payload?.createdAt
        ? new Date(
            payload.createdAt
          ).toISOString()
        : new Date().toISOString();

    console.log(
      `Inbound from ${from}: ${messageText}`
    );

    // Replay / duplicate-delivery guard: 360Messenger retries deliver the same
    // message again. Same sender + same body + same provider timestamp within a
    // 10 minute window is treated as already processed.
    {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: already } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("direction", "inbound")
        .eq("phone_number", from || "")
        .eq("message_body", messageText)
        .gte("sent_at", since)
        .limit(1);
      if (already?.length) {
        console.log(`whatsapp-inbound: duplicate delivery ignored for ${from}`);
        return earlyResponse;
      }
    }

    // A phone number can sit on several customer records.
    // Fetch them all so we don't accidentally select the wrong job.
    const key =
      last9Digits(from);

    const {
      data: candidateCustomers,
    } =
      await supabase
        .from("customers")
        .select(
          "id, user_id, organisation_id, name, phone, landline_phone, created_at"
        )
        .or(
          `phone.ilike.%${key},landline_phone.ilike.%${key}`
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(50);

    const sender = key
      ? resolveInboundSender(
          from,
          candidateCustomers ??
            [],
          samePhone
        )
      : ({
          action: "drop",
          reason: "no_match",
        } as const);

    if (
      sender.action ===
      "drop"
    ) {
      console.error(
        `Inbound WhatsApp from ${from} dropped (${sender.reason}) — no safe customer/organisation match. Body: ${messageText}`
      );

      return earlyResponse;
    }

    const inboundOrgId =
      sender.logging_organisation_id;

    const customer =
      sender.primary;

    const senderCustomerIds =
      sender.customers.map(
        (c) => c.id
      );

    // Where replies/notifications/activity are written.
    // Defaults to the newest record's org and may be narrowed
    // to the org that actually owns the reminded job.
    let actingOrgId =
      inboundOrgId;

    if (
      sender.customers.length >
      1
    ) {
      console.log(
        `Inbound ${from} matches ${sender.customers.length} customer records across ${sender.orgs.length} org(s): ${senderCustomerIds.join(
          ", "
        )}`
      );
    }

    // whatsapp_messages.user_id is NOT NULL.
    // Resolve an owning user from the customer,
    // falling back to the organisation owner.
    let inboundUserId:
      | string
      | null =
      (customer as any)
        ?.user_id ??
      null;

    if (!inboundUserId) {
      const { data: org } =
        await supabase
          .from("organisations")
          .select(
            "owner_user_id"
          )
          .eq(
            "id",
            inboundOrgId
          )
          .maybeSingle();

      inboundUserId =
        (org as any)
          ?.owner_user_id ??
        null;
    }

    if (inboundUserId) {
      const {
        error: waInsertErr,
      } =
        await supabase
          .from(
            "whatsapp_messages"
          )
          .insert({
            user_id:
              inboundUserId,
            organisation_id:
              inboundOrgId,
            customer_id:
              customer?.id ??
              null,
            message_body:
              messageText,
            message_type:
              "Inbound Reply",
            sent_by:
              "customer",
            status:
              "Received",
            direction:
              "inbound",
            phone_number:
              from || null,
            customer_reply:
              messageText,
            reply_received_at:
              createdAt,
            sent_at:
              createdAt,
          });

      if (waInsertErr) {
        console.error(
          "Failed to insert whatsapp_messages inbound row:",
          waInsertErr.message
        );
      }
    } else {
      console.error(
        `Cannot record inbound whatsapp_messages row for org ${inboundOrgId}: no customer.user_id and no organisations.owner_user_id`
      );
    }

    // Mirror inbound to message_log so it appears in Chat Inbox History
    try {
      await supabase
        .from("message_log")
        .insert({
          organisation_id:
            inboundOrgId,
          customer_id:
            customer?.id ??
            null,
          message_type:
            "inbound",
          channel:
            "whatsapp",
          direction:
            "inbound",
          content:
            messageText,
          status:
            "received",
          sent_by:
            "customer",
          sent_at:
            createdAt,
        });
    } catch (e) {
      console.error(
        "Failed to log inbound message_log:",
        e
      );
    }

    // Send a WhatsApp reply to the inbound sender.
    // Never throws to the main webhook.
    async function sendReply(
      text: string,
      messageType: string
    ) {
      try {
        const {
          apiKey,
        } =
          await getWhatsAppConfig(
            supabase,
            actingOrgId
          );

        if (!from) {
          return;
        }

        const form =
          new FormData();

        form.append(
          "phonenumber",
          normalisePhone(
            from
          )
        );

        form.append(
          "text",
          text
        );

        const response =
          await fetch(
            "https://api.360messenger.com/v2/sendMessage",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              body: form,
            }
          );

        const responseText =
          await response.text();

        let responseResult:
          | any
          | null = null;

        try {
          responseResult =
            JSON.parse(
              responseText
            );
        } catch {
          responseResult = null;
        }

        const sendOk =
          response.ok &&
          (
            responseResult == null ||
            responseResult.success !==
              false
          );

        if (!sendOk) {
          throw new Error(
            `360Messenger reply failed (${response.status}): ${responseText.slice(
              0,
              300
            )}`
          );
        }

        await supabase
          .from("message_log")
          .insert({
            organisation_id:
              actingOrgId,
            customer_id:
              customer?.id ??
              null,
            message_type:
              messageType,
            channel:
              "whatsapp",
            direction:
              "outbound",
            content:
              text,
            status:
              "sent",
            sent_by:
              "system",
            sent_at:
              new Date().toISOString(),
          });
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : String(e);

        console.error(
          `Failed to send ${messageType}:`,
          msg
        );

        await logWhatsAppFailure(
          supabase,
          {
            organisation_id:
              actingOrgId,
            customer_id:
              customer?.id ??
              null,
            message_type:
              messageType,
            content:
              text,
            sent_by:
              "system",
            error_message:
              msg,
          }
        );
      }
    }

    async function logActivity(
      label: string,
      serviceCallId:
        | string
        | null,
      customerId?:
        | string
        | null
    ) {
      try {
        await supabase
          .from(
            "customer_activity"
          )
          .insert({
            organisation_id:
              actingOrgId,
            customer_id:
              customerId ??
              customer?.id ??
              null,
            service_call_id:
              serviceCallId,
            event_type:
              "whatsapp_received",
            event_label:
              label,
          });
      } catch (e) {
        console.error(
          "Failed to log customer_activity:",
          e
        );
      }
    }

    // Raise an in-app notification for this org's office/admin staff.
    async function notifyStaff(
      title: string,
      body: string,
      jobId:
        | string
        | null,
      metadata: Record<
        string,
        unknown
      >
    ) {
      try {
        const {
          data: staff,
        } =
          await supabase
            .from("profiles")
            .select("user_id")
            .eq(
              "organisation_id",
              actingOrgId
            )
            .in("role", [
              "office",
              "admin",
            ])
            .eq(
              "is_active",
              true
            );

        const rows =
          (staff ?? [])
            .filter(
              (s: any) =>
                !!s?.user_id
            )
            .map(
              (s: any) => ({
                recipient_user_id:
                  s.user_id,
                organisation_id:
                  actingOrgId,
                notification_type:
                  "whatsapp_reply",
                title,
                body,
                role: "office",
                job_id:
                  jobId,
                is_read: false,
                metadata,
              })
            );

        if (
          rows.length > 0
        ) {
          const {
            error,
          } =
            await supabase
              .from(
                "notifications"
              )
              .insert(rows);

          if (error) {
            console.error(
              "Failed to insert staff notifications:",
              error.message
            );
          }
        }
      } catch (e) {
        console.error(
          "Failed to notify staff:",
          e
        );
      }
    }

    if (customer?.id) {
      await supabase
        .from("customers")
        .update({
          last_message_sent_at:
            createdAt,
        })
        .in(
          "id",
          senderCustomerIds
        );

      const normalizedText =
        messageText
          .trim()
          .toUpperCase();

      // Explicit STOP / UNSUBSCRIBE support is preserved from main.
      // Treat both as the same opt-out intent.
      const intent =
        parseInboundIntent(
          messageText
        );

      const isExplicitOptOut =
        normalizedText ===
          "STOP" ||
        normalizedText ===
          "UNSUBSCRIBE";

      if (
        intent === "stop" ||
        isExplicitOptOut
      ) {
        await supabase
          .from("customers")
          .update({
            opted_out:
              true,
            opted_out_date:
              createdAt.slice(
                0,
                10
              ),
            whatsapp_opt_in:
              false,
            whatsapp_reminders_enabled:
              false,
            whatsapp_opt_out_at:
              createdAt,
            whatsapp_opt_out_source:
              "inbound_stop",
            last_reminder_response:
              "stop",
          })
          .in(
            "id",
            senderCustomerIds
          );

        const branding =
          await getOrgBrandingClient(
            supabase,
            inboundOrgId
          );

        await sendReply(
          `Got it — we've removed you from our reminder list. No further messages will be sent. ${
            branding.footer ||
            branding.name
          }.`,
          "opt_out_reply"
        );

        await logActivity(
          'WhatsApp reply "STOP" — customer opted out',
          null,
          customer.id
        );

        return earlyResponse;
      }

      if (
        intent === "confirm" ||
        intent === "cancel"
      ) {
        // Candidate jobs for EVERY record sharing the number.
        const { data: jobs } =
          await supabase
            .from("service_calls")
            .select(
              "id, status, scheduled_date, time_block, organisation_id, reminder_2day_sent, customer_id, confirmed"
            )
            .in(
              "customer_id",
              senderCustomerIds
            )
            .eq(
              "reminder_2day_sent",
              true
            )
            .order(
              "scheduled_date",
              {
                ascending:
                  true,
              }
            );

        const today =
          businessToday();

        const orgChoice =
          pickActingOrg(
            jobs ?? [],
            today
          );

        if (
          orgChoice.action ===
            "drop" &&
          orgChoice.reason ===
            "cross_org_ambiguous"
        ) {
          console.error(
            `Inbound ${intent} from ${from}: eligible jobs in more than one organisation — refusing to guess. Job ids: ${(jobs ?? [])
              .map(
                (j: any) =>
                  j.id
              )
              .join(", ")}`
          );

          return earlyResponse;
        }

        if (
          orgChoice.action ===
          "act"
        ) {
          actingOrgId =
            orgChoice.organisation_id;
        }

        const branding =
          await getOrgBrandingClient(
            supabase,
            actingOrgId
          );

        const callUs =
          branding.phone
            ? ` on ${branding.phone}`
            : "";

        const decision =
          resolveReplyTarget(
            orgChoice.action ===
              "act"
              ? orgChoice.jobs
              : [],
            today
          );

        const customerName =
          (customer as any)
            .name ||
          "customer";

        const ownerName =
          (jobId: string | null) => {
            const j =
              (
                jobs ?? []
              ).find(
                (x: any) =>
                  x.id ===
                  jobId
              );

            const owner =
              sender.customers.find(
                (c) =>
                  c.id ===
                  (j as any)
                    ?.customer_id
              );

            return (
              owner?.name ||
              customerName
            );
          };

        // No upcoming reminded booking.
        if (
          decision.action ===
          "none"
        ) {
          await sendReply(
            `Thanks — we couldn't match that to an upcoming appointment. Please call us${callUs} and we'll help.`,
            "reply_unmatched"
          );

          await logActivity(
            `WhatsApp reply "${intent.toUpperCase()}" — no matching upcoming job`,
            null
          );

          console.log(
            `Inbound ${intent} from customer ${customer.id}: no eligible job`
          );

          return earlyResponse;
        }

        // Two or more upcoming bookings — never guess.
        if (
          decision.action ===
          "escalate"
        ) {
          const soonest =
            decision.jobs[0];

          await sendReply(
            `Thanks — you have more than one upcoming appointment with us, so we don't want to change the wrong one. Please call us${callUs} and we'll sort it straight away.`,
            "reply_ambiguous"
          );

          await notifyStaff(
            intent ===
              "cancel"
              ? "WhatsApp cancel needs action"
              : "WhatsApp confirm needs action",
            `${
              ownerName(
                soonest.id
              )
            } replied ${intent.toUpperCase()} but has ${decision.jobs.length} upcoming appointments — please call them back.`,
            soonest.id,
            {
              customer_id:
                (soonest as any)
                  .customer_id ??
                customer.id,
              intent,
              reason:
                decision.reason,
              candidate_job_ids:
                decision.jobs.map(
                  (j) =>
                    j.id
                ),
            }
          );

          try {
            await supabase
              .from(
                "service_calls"
              )
              .update({
                follow_up_needed:
                  true,
                follow_up_detail:
                  `Customer replied ${intent.toUpperCase()} by WhatsApp but has ${decision.jobs.length} upcoming appointments — confirm which one by phone.`,
                follow_up_resolved:
                  false,
              })
              .eq(
                "id",
                soonest.id
              );
          } catch (e) {
            console.error(
              "Failed to flag follow-up:",
              e
            );
          }

          await logActivity(
            `WhatsApp reply "${intent.toUpperCase()}" — ambiguous (${decision.jobs.length} upcoming jobs), escalated to office`,
            soonest.id,
            (soonest as any)
              .customer_id ??
              customer.id
          );

          return earlyResponse;
        }

        // Exactly one match — safe to act.
        const job =
          decision.job;

        const jobOwnerId =
          (job as any)
            .customer_id ??
          customer.id;

        const jobOwnerName =
          ownerName(
            job.id
          );

        if (
          intent ===
          "confirm"
        ) {
          await supabase
            .from(
              "service_calls"
            )
            .update({
              confirmed:
                true,
              confirmed_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              job.id
            );

          await sendReply(
            `Thanks ${jobOwnerName}, your appointment is confirmed. See you then! ${
              branding.footer ||
              branding.name
            }`,
            "reply_confirmed"
          );

          await logActivity(
            "WhatsApp received — Appointment Confirmed",
            job.id,
            jobOwnerId
          );

          await logCustomerAudit(
            supabase,
            {
              action_type:
                "job_confirmed",
              entity_id:
                job.id,
              detail:
                `${jobOwnerName} confirmed their appointment by WhatsApp reply`,
              organisation_id:
                actingOrgId,
              customer_name:
                jobOwnerName,
              metadata: {
                intent:
                  "confirm",
                customer_id:
                  jobOwnerId,
                service_call_id:
                  job.id,
              },
            }
          );
        } else {
          // A customer may always cancel, even after CONFIRM.
          const wasConfirmed =
            reversesConfirmation(
              job as any
            );

          await supabase
            .from(
              "service_calls"
            )
            .update(
              buildCancelUpdate(
                job as any,
                jobOwnerName
              )
            )
            .eq(
              "id",
              job.id
            );

          await sendReply(
            `Thanks ${jobOwnerName}, your appointment has been cancelled. To rebook please call us${callUs}. ${
              branding.footer ||
              branding.name
            }`,
            "reply_cancelled"
          );

          await notifyStaff(
            "Job cancelled by customer",
            wasConfirmed
              ? `${jobOwnerName} confirmed and then cancelled by WhatsApp reply — please call to check it wasn't sent by mistake.`
              : `${jobOwnerName} cancelled their appointment by WhatsApp reply — please call to check it wasn't sent by mistake.`,
            job.id,
            {
              customer_id:
                jobOwnerId,
              intent,
              service_call_id:
                job.id,
              reversed_confirmation:
                wasConfirmed,
            }
          );

          await logActivity(
            wasConfirmed
              ? "WhatsApp received — Appointment Cancelled (after confirming)"
              : "WhatsApp received — Appointment Cancelled",
            job.id,
            jobOwnerId
          );

          await logCustomerAudit(
            supabase,
            {
              action_type:
                "job_cancelled",
              entity_id:
                job.id,
              detail:
                cancelAuditDetail(
                  job as any
                ),
              organisation_id:
                actingOrgId,
              customer_name:
                jobOwnerName,
              metadata: {
                intent:
                  "cancel",
                reason:
                  WHATSAPP_CANCEL_REASON,
                customer_id:
                  jobOwnerId,
                service_call_id:
                  job.id,
                reversed_confirmation:
                  wasConfirmed,
              },
            }
          );
        }

        return earlyResponse;
      }
    }

    return earlyResponse;
  }
);