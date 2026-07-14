# Uniform log-and-continue for WhatsApp sends — with response-contract fix

Frontend audit (previous turn) found:
- 3 of 4 call sites either fire-and-forget or already gate on `data.success`.
- 1 call site (`ExtraWorkSheet.tsx:155`) checks **only** `fnError` and would show a false "sent via WhatsApp" toast if the backend flipped from 500→200 without a clear success flag.

So the backend response contract must keep `success:false` on WhatsApp failure. `whatsapp_sent:false` alone is not enough — no frontend reads it.

## Shared helper

Add to `supabase/functions/_shared/whatsapp.ts`:

```ts
export async function logWhatsAppFailure(supabase: any, row: {
  organisation_id: string | null;
  customer_id?: string | null;
  message_type: string;
  content: string;
  related_id?: string | null;
  related_type?: string | null;
  sent_by?: string | null;
  error_message: string;
}) {
  try {
    await supabase.from("message_log").insert({
      organisation_id: row.organisation_id,
      customer_id: row.customer_id ?? null,
      message_type: row.message_type,
      channel: "whatsapp",
      direction: "outbound",
      content: row.content,
      status: "failed",
      related_id: row.related_id ?? null,
      related_type: row.related_type ?? null,
      sent_by: row.sent_by ?? null,
      error_message: row.error_message.slice(0, 500),
      sent_at: new Date().toISOString(),
    });
  } catch (_e) {
    console.error("logWhatsAppFailure insert failed:", _e);
  }
}
```

## Response contract on WhatsApp failure — uniform across the 6 functions

- HTTP **200** always. Parent DB write is preserved.
- Body: `{ success: false, whatsapp_sent: false, reason: <error message> }` plus any parent-operation fields already returned (e.g. `invoice_number`, `customer_name`).
- `success:false` on the WhatsApp *step* — because 3 frontends already gate their "sent" UI on `data.success` and switching them silently would mis-report success. The parent operation still succeeded; the invoice/receipt/quote row exists. The frontends that treat `data.success` as "WhatsApp went out" continue to work correctly.
- Fire-and-forget caller (`useEngineerJobs.ts:513`) is unaffected — it ignores the body.
- `ExtraWorkSheet.tsx:155` will still show the misleading "sent via WhatsApp" toast because it only checks `fnError`. **Flag as follow-up ticket** (not a blocker): switch that call site to also check `!fnData?.success` and downgrade the toast in that branch. Not doing it now per the user's instruction.

## Per-function changes

For each: wrap `getWhatsAppConfig(...)` + `normalisePhone(...)` + send `fetch(...)` in a local `try/catch`. In catch: `logWhatsAppFailure(...)` then return 200 with `success:false, whatsapp_sent:false, reason`. Never rethrow.

1. **`create-job-invoice/index.ts`** — already has a local try; widen to cover `normalisePhone` + send. On catch: `logWhatsAppFailure({ message_type:"invoice", related_id: invoice.id, related_type:"invoice", customer_id: job.customer_id, sent_by: job.user_id, content: waMessage ?? "invoice send", organisation_id: job.organisation_id, error_message:(e as Error).message })`. Response already carries `whatsapp_sent:false` today — add `success:false` to that failure branch, keep `invoice_number` intact.

2. **`accept-quote/index.ts`** (two sites, both already have local try/catch):
   - Office-alert (~205): add `logWhatsAppFailure({ message_type:"office_alert", related_id: quote.id, related_type:"quote", organisation_id: alertOrgId, content: alertMsg ?? "quote office alert", error_message:(e as Error).message })`. Parent response unchanged (this is a side alert, not surfaced in the main body).
   - Deposit-send (~354): add `logWhatsAppFailure({ message_type:"quote_deposit", related_id: quote.id, related_type:"quote", customer_id: customer.id, organisation_id: orgId, content: depositMsg ?? "deposit link", error_message:(e as Error).message })`.

3. **`quote-accepted-alert/index.ts`** — extend existing try around helper to also wrap the send fetch. On catch: `logWhatsAppFailure({ message_type:"office_alert", related_id: quote_id, related_type:"quote", organisation_id: orgIdForKey, content: alertBody ?? "quote accepted alert", error_message:(e as Error).message })`. Continue returning `{ success:true, sent:false, reason }` (matches its own existing contract — no frontend gates on this).

4. **`send-whatsapp-receipt/index.ts`** — currently propagates as 500. **Add** local try/catch around `getWhatsAppConfig` + `normalisePhone` + send fetch (and the message_log status update). On catch: `logWhatsAppFailure({ message_type:"receipt", related_id: job.id, related_type:"service_call", customer_id: job.customer_id, organisation_id: job.organisation_id, content: message ?? "receipt send", error_message:(e as Error).message })` and return 200 with `{ success:false, whatsapp_sent:false, reason:(e as Error).message }`. Keeps `ServiceReceipt.tsx` and `TakePaymentModal.tsx` destructive-toast behavior intact.

5. **`send-extrawork-payment-link/index.ts`** — currently propagates as 500/502. **Add** local try/catch same shape. On catch: `logWhatsAppFailure({ message_type:"extrawork_payment", related_id: service_call_id, related_type:"service_call", customer_id, organisation_id: orgId, content: message ?? "extra work payment link", error_message:(e as Error).message })` and return 200 `{ success:false, whatsapp_sent:false, reason }`. **Known gap** flagged above: `ExtraWorkSheet.tsx:155` currently only checks `fnError`; it will start showing the success toast even on failure. Ticket to follow.

6. **`whatsapp-inbound/index.ts`** — STOP opt-out reply (~106): already has local try/catch, add `logWhatsAppFailure({ message_type:"opt_out_reply", customer_id: matchedCustomerId ?? null, organisation_id: inboundOrgId, content: "STOP opt-out confirmation", error_message:(e as Error).message })`. Continue returning 200 to 360dialog.

## Out of scope
- No changes to `_shared/notifyAdmin.ts`, `getWhatsAppConfig`, `normalisePhone`.
- No changes to `ExtraWorkSheet.tsx` — logged as follow-up.
- No RLS/schema changes — `message_log` schema already accepts these columns.

## Follow-up ticket to open (do not implement now)
> **"Extra work payment link: surface WhatsApp send failures in the sheet"** — `src/components/engineer/ExtraWorkSheet.tsx:155-185` currently only checks `fnError` and shows "Extra work quote sent · Sent via WhatsApp" for any 200. After the log-and-continue backend change, failures return 200 with `success:false`, so add `else if (!fnData?.success)` branch that shows the existing destructive toast copy ("Extra work saved · Quote created but WhatsApp send failed. Office can resend.").

## Verification after build
1. Deploy the 6 functions.
2. K&N invoice send end-to-end → `message_log` row `status='sent'`, response 200 with `success:true, whatsapp_sent:true, invoice_number`.
3. Trigger a Dublin-Gas invoice send (its `api_key_secret` points at a non-existent secret) → invoice row created, 200 with `success:false, whatsapp_sent:false, reason` containing `Secret "THREESIXTY_API_KEY_DUBLIN_GAS" not set`, and `message_log` row `status='failed'` with matching `error_message`.
4. Same failure test for `send-whatsapp-receipt` (expect destructive toast on the two office/receipt UIs) and `send-extrawork-payment-link` (expect the known-gap wrong success toast — confirm log row still lands).
5. Grep the 6 files: no remaining `Deno.env.get("THREESIXTY_API_KEY")`.
