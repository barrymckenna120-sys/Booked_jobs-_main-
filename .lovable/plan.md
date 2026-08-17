# Remove K&N hardcoded fallbacks from send-invoice-whatsapp

## The bug is latent, not live

`send-invoice-whatsapp` has never successfully sent a message. It writes `message_type: "invoice_sent"` (line 141), and `message_log` holds **0** such rows out of 937 total. No customer has received the broken text. The existing `Pay securely here` messages in `message_log` come from `_shared/depositLink.ts` (types `payment_link` / `deposit_reminder`) and carry correct SumUp URLs; the `invoice` rows come from `create-job-invoice`, which has no such line.

This means there is no "unchanged from today" baseline for K&N to compare against, and the fix carries no risk of altering a message customers already receive.

## What verification changed about the original diff


Two findings from checking the live schema and data mean the originally proposed diff would have shipped a bug.

### Finding 1: `settings.template_payment_link` is a message template, not a URL

K&N's stored value is:

```
Hi {{name}}, thanks for having us today!

Your invoice for €{{amount}} is ready:
→ {{payment_link}}

K&N Gas Services 
{{phone}}
```

Today, line 76-79 uses this as the payment **link**, so K&N's live invoice message renders `Pay securely here: Hi {{name}}, thanks for having us today!...` — the raw template, and no actual Stripe link. This is a pre-existing production bug, not something the change introduces. Keeping `template_payment_link` as the link source would make it permanent.

### Finding 2: the real per-tenant payment link already exists elsewhere

`tenant_integrations` has a dedicated row per org:

- K&N (`8c37827f-...`): `integration_type='stripe'`, `config.payment_link = https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c` — the exact value that was hardcoded, which is why the fallback firing went unnoticed.
- Cavan Gas (`62d6c1c3-...`): no `stripe` row at all, and `settings.template_payment_link` is NULL.

### Finding 3: the `cfg.stripe_payment_link` fallback is dead code

`cfg` at line 60 is the **360messenger** config. No org has a `stripe_payment_link` key there (K&N's holds only `api_key_secret`, `company_name`, `company_phone`, `country_code`). That branch has never resolved for anyone.

### Confirmed schema

`public.edge_function_logs`: `id` uuid, `function_name` text NOT NULL, `error_message` text NOT NULL, `payload` jsonb, `created_at` timestamptz. Matches the intended insert.

## Revised change (send-invoice-whatsapp only)

Source the payment link from the tenant's `stripe` integration row, drop all three K&N literals, and skip-and-log when the tenant is unconfigured.

```diff
+    // Per-tenant Stripe payment link. There is no global fallback — a
+    // customer's payment must never land in another tenant's account.
+    const { data: stripeIntegration } = await supabase
+      .from("tenant_integrations")
+      .select("config")
+      .eq("organisation_id", job.organisation_id)
+      .eq("integration_type", "stripe")
+      .maybeSingle();
+
+    const stripeCfg = (stripeIntegration?.config ?? {}) as Record<string, any>;
+    const paymentLink =
+      typeof stripeCfg.payment_link === "string" ? stripeCfg.payment_link.trim() : "";
+
-    const businessName = orgSettings?.business_name || "K & N Gas Services";
-    const businessPhone = orgSettings?.business_phone || "087 368 5252";
-    const stripePaymentLink =
-      orgSettings?.template_payment_link ||
-      cfg.stripe_payment_link ||
-      "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";
-    const certPrefix = orgSettings?.cert_prefix || "JOB";
+    // Tenant-scoped branding only — never fall back to another tenant's details.
+    const businessName = orgSettings?.business_name?.trim() || "";
+    if (!businessName) {
+      await supabase.from("edge_function_logs").insert({
+        function_name: "send-invoice-whatsapp",
+        error_message: "Skipped: settings.business_name not configured for organisation",
+        payload: { organisation_id: job.organisation_id, service_call_id },
+      });
+      return json({ success: true, skipped: true, reason: "business_name_not_configured" });
+    }
+
+    if (!paymentLink) {
+      await supabase.from("edge_function_logs").insert({
+        function_name: "send-invoice-whatsapp",
+        error_message: "Skipped: no Stripe payment link configured for organisation",
+        payload: { organisation_id: job.organisation_id, service_call_id },
+      });
+      return json({ success: true, skipped: true, reason: "payment_link_not_configured" });
+    }
+
+    // Phone is optional — omit the line rather than substitute another tenant's number.
+    const businessPhone = orgSettings?.business_phone?.trim() || "";
+    const certPrefix = orgSettings?.cert_prefix || "JOB";
```

The `settings` select drops `template_payment_link` (it is a template, unrelated to this line) and the message body uses `paymentLink`:

```diff
-      .select("business_name, business_phone, template_payment_link, cert_prefix")
+      .select("business_name, business_phone, cert_prefix")
...
-      `Pay securely here: ${stripePaymentLink}\n\n` +
+      `Pay securely here: ${paymentLink}\n\n` +
...
-      `${businessName}\n☎️ ${businessPhone}`;
+      `${businessName}${businessPhone ? `\n☎️ ${businessPhone}` : ""}`;
```

Opt-out logic (lines 45-48) is untouched. No other function is touched.

## Behaviour change to be aware of

For K&N this is a **fix, not a no-op**: the message goes from printing a raw template blob to printing the real Stripe URL. That is the correct outcome but it is a visible change to a live customer-facing invoice message, so it needs a sign-off rather than being slipped in as a refactor.

## Verification

1. Call `send-invoice-whatsapp` for a real K&N job — capture the raw response body and the `message_log` content, and confirm the `Pay securely here:` line now shows `https://buy.stripe.com/...` rather than the template text.
2. Call it for a Cavan Gas test job — Cavan Gas needs no setup (no `stripe` integration row, `template_payment_link` already NULL, so nothing to clear or restore). Confirm the raw body is `{"success":true,"skipped":true,"reason":"payment_link_not_configured"}`, no 360Messenger request is made, and an `edge_function_logs` row is written.
3. Confirm no `message_log` row is created for the skipped send.

## Still out of scope

The same hardcoded Stripe literal remains in `send-extrawork-payment-link:61` and `send-outstanding-invoice-reminders:17`, and `"K & N Gas Services"` fallbacks remain in six other functions plus `_shared/depositLink.ts`. Those stay untouched here.
