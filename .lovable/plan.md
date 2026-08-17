# Remove K&N hardcoded fallbacks from send-invoice-whatsapp

## Current state (verified)

`supabase/functions/send-invoice-whatsapp/index.ts` sources branding and the payment link at lines 67-80:

```ts
const { data: orgSettings } = await supabase
  .from("settings")
  .select("business_name, business_phone, template_payment_link, cert_prefix")
  .eq("organisation_id", job.organisation_id)
  .maybeSingle();

const businessName = orgSettings?.business_name || "K & N Gas Services";
const businessPhone = orgSettings?.business_phone || "087 368 5252";
const stripePaymentLink =
  orgSettings?.template_payment_link ||
  cfg.stripe_payment_link ||
  "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";
const certPrefix = orgSettings?.cert_prefix || "JOB";
```

- Company name and phone: `public.settings` for the job's org, falling back to K&N literals.
- Payment link: `settings.template_payment_link`, then `tenant_integrations.config.stripe_payment_link` (the 360messenger row fetched at line 53), then a hardcoded K&N Stripe link.
- The Stripe URL is a **hardcoded literal in this file**, not a shared constant or env var.
- Opt-out is already handled correctly here (lines 45-48) — no change needed.

### Where else the same Stripe link lives

The literal appears in two other functions, each with its own copy:

- `supabase/functions/send-extrawork-payment-link/index.ts:61` — `job?.payment_link || "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c"`
- `supabase/functions/send-outstanding-invoice-reminders/index.ts:17` — `const DEFAULT_STRIPE_LINK = "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c"`

Fixing `send-invoice-whatsapp` alone does **not** clear the pre-live Stripe swap item. `"K & N Gas Services"` also appears as a fallback in `send-deposit-reminder`, `trigger-outstanding-reminder`, `send-payment-received`, `send-area-bulk-whatsapp`, `generate-accountant-export`, and `_shared/depositLink.ts`.

## Proposed change (this function only)

Replace all three K&N fallbacks with tenant-scoped values, and skip-and-log rather than substituting another tenant's data.

```diff
-    const businessName = orgSettings?.business_name || "K & N Gas Services";
-    const businessPhone = orgSettings?.business_phone || "087 368 5252";
-    const stripePaymentLink =
-      orgSettings?.template_payment_link ||
-      cfg.stripe_payment_link ||
-      "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";
-    const certPrefix = orgSettings?.cert_prefix || "JOB";
+    // Tenant-scoped branding only — never fall back to another tenant's details.
+    const businessName = orgSettings?.business_name?.trim();
+    if (!businessName) {
+      await supabase.from("edge_function_logs").insert({
+        function_name: "send-invoice-whatsapp",
+        error_message: "Skipped: settings.business_name not configured for organisation",
+        payload: { organisation_id: job.organisation_id, service_call_id },
+      });
+      return json({ success: true, skipped: true, reason: "business_name_not_configured" });
+    }
+
+    // Payment link: org settings template, then this org's own integration config.
+    // No global fallback — a customer's payment must never land in another tenant's account.
+    const stripePaymentLink =
+      orgSettings?.template_payment_link?.trim() ||
+      (typeof cfg.stripe_payment_link === "string" ? cfg.stripe_payment_link.trim() : "");
+    if (!stripePaymentLink) {
+      await supabase.from("edge_function_logs").insert({
+        function_name: "send-invoice-whatsapp",
+        error_message: "Skipped: no payment link configured for organisation",
+        payload: { organisation_id: job.organisation_id, service_call_id },
+      });
+      return json({ success: true, skipped: true, reason: "payment_link_not_configured" });
+    }
+
+    // Phone is optional — omit the line rather than substitute another tenant's number.
+    const businessPhone = orgSettings?.business_phone?.trim() || "";
+    const certPrefix = orgSettings?.cert_prefix || "JOB";
```

And make the phone line conditional in the message body (line 113):

```diff
-      `${businessName}\n☎️ ${businessPhone}`;
+      `${businessName}${businessPhone ? `\n☎️ ${businessPhone}` : ""}`;
```

## Notes

- Skips return HTTP 200 with `skipped: true` so callers don't treat a config gap as a send failure, matching the existing opt-out branch at line 47.
- Every skip writes an `edge_function_logs` row so a missing tenant config is visible rather than silent.
- `cert_prefix` keeps its `"JOB"` default — that is generic, not K&N-specific.

## Out of scope for this change

The other two copies of the hardcoded Stripe link (`send-extrawork-payment-link`, `send-outstanding-invoice-reminders`) and the `"K & N Gas Services"` fallbacks in the six other functions listed above. Say the word and I'll fold them into this change or plan them as a follow-up sweep.

## Verification

1. Call `send-invoice-whatsapp` for a K&N job (settings populated) — confirm the message renders K&N's real name/phone/link from `settings`, unchanged from today.
2. Call it for an org with no `template_payment_link` and no `config.stripe_payment_link` — confirm `skipped: true`, `reason: "payment_link_not_configured"`, no 360Messenger call, and an `edge_function_logs` row.
3. Confirm no `message_log` row is written on a skip.
