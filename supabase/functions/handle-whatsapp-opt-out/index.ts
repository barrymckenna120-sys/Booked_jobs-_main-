import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { machineOrgDenial, resolveMachineOrganisation } from "../_shared/machineOrg.ts";
import { last9Digits } from "../_shared/phone.ts";

/**
 * Inbound STOP / opt-out handler.
 *
 * Previously this matched `customers` by phone number GLOBALLY and took the
 * first row, so an inbound STOP could flip the opted_out flag on ANOTHER
 * tenant's customer that happened to share the number.
 *
 * Correct order, enforced here:
 *   authenticate trusted webhook
 *   -> resolve the organisation from the trusted integration identity
 *      (per-tenant secret, or the receiving WhatsApp account/number)
 *   -> normalise the phone
 *   -> match customers WITHIN that organisation only
 *   -> update + log against that same organisation
 *
 * If the organisation cannot be resolved deterministically, nothing is modified.
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone: string = typeof body?.phone === "string" ? body.phone : "";
    // Receiving WhatsApp account/number as reported by the provider. Used to
    // resolve the tenant when no per-tenant secret is configured.
    const accountRef: string | null = body?.account_id ?? body?.to ??
      body?.receiving_number ?? body?.instance_id ?? null;

    // 1. Authenticate + bind the caller to exactly one organisation.
    const resolved = await resolveMachineOrganisation(req, {
      fnName: "handle-whatsapp-opt-out",
      integrationTypes: ["360messenger", "whatsapp"],
      identifier: {
        keys: ["account_id", "instance_id", "sender_number", "whatsapp_number", "phone_number"],
        value: accountRef,
      },
      claimedOrgId: typeof body?.organisation_id === "string" ? body.organisation_id : null,
    });

    if (!resolved.ok) {
      // Ambiguous / unresolved inbound opt-out: change nothing, log without PII.
      if (resolved.reason !== "unauthenticated") {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("edge_function_logs").insert({
          function_name: "handle-whatsapp-opt-out",
          error_message: `Inbound opt-out not applied: ${resolved.reason}`,
          payload: { reason: resolved.reason, phone_suffix_present: Boolean(rawPhone) },
        }).then(() => {}, () => {});
      }
      return machineOrgDenial(resolved, cors);
    }
    const orgId = resolved.orgId;

    if (!rawPhone) return json({ error: "phone is required" }, 400);

    // 2. Normalise to 353XXXXXXXXX + local form.
    let digits = rawPhone.replace(/^\+/, "").replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "353" + digits.slice(1);
    if (!digits.startsWith("353") && digits.length === 9) digits = "353" + digits;
    const international = digits;
    const local = international.startsWith("353") ? "0" + international.slice(3) : international;
    const suffix = last9Digits(international);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3. Match inside the resolved organisation ONLY.
    const { data: rows, error: findErr } = await supabase
      .from("customers")
      .select("id, phone, whatsapp_phone, organisation_id, opted_out")
      .eq("organisation_id", orgId)
      .or(
        `phone.eq.${international},phone.eq.+${international},phone.eq.${local},` +
          `whatsapp_phone.eq.${international},whatsapp_phone.eq.+${international},whatsapp_phone.eq.${local}`,
      );
    if (findErr) throw findErr;

    const matches = (rows ?? []).filter((r) =>
      suffix &&
      (last9Digits(String(r.phone ?? "")) === suffix ||
        last9Digits(String(r.whatsapp_phone ?? "")) === suffix)
    );

    if (matches.length === 0) {
      return json({ success: false, message: "customer not found", organisation_id: orgId });
    }

    // Every match is inside this tenant, so opting them all out is correct and
    // idempotent (repeated STOPs converge on the same state).
    const alreadyOptedOut = matches.every((m) => m.opted_out === true);
    const ids = matches.map((m) => m.id);

    if (!alreadyOptedOut) {
      const { error: updErr } = await supabase
        .from("customers")
        .update({ opted_out: true, opted_out_date: new Date().toISOString() })
        .in("id", ids)
        .eq("organisation_id", orgId);
      if (updErr) throw updErr;

      await supabase.from("message_log").insert(
        ids.map((id) => ({
          customer_id: id,
          organisation_id: orgId,
          channel: "whatsapp",
          direction: "inbound",
          message_type: "opt_out",
          content: "Customer replied STOP — opted out of WhatsApp messages",
          status: "received",
          sent_at: new Date().toISOString(),
          sent_by: "customer",
        })),
      );
    }

    return json({
      success: true,
      organisation_id: orgId,
      resolved_via: resolved.via,
      customer_ids: ids,
      already_opted_out: alreadyOptedOut,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("handle-whatsapp-opt-out failed:", message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
