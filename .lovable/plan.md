# BJ-B2b / BJ-B2c — read-only findings and proposed diffs

No code changed. Everything below is confirmed by reading the current files and querying live config.

## Three surprises the old audit table didn't capture

1. **`send-payment-received` has no sourcing at all.** It never reads the tenant's 360messenger config for branding — the sign-off is a bare literal. So this one is not "replace a fallback", it is "add sourcing + guard".
2. **`trigger-outstanding-reminder` doesn't send WhatsApp.** It posts `company_name` / `company_phone` into a Make webhook payload. A skip here means the Make scenario never fires for that tenant, which is the correct fail-safe but is a behaviour change worth naming explicitly.
3. **Cavan Gas's 360messenger `company_phone` is empty today**, so three of the four B2b functions are *currently* signing Cavan Gas messages with K&N's phone number. That is a live cross-tenant leak, not a theoretical fallback.

## Confirmed current state — B2b

| Function | Literal(s) | Line(s) | Sources today |
| --- | --- | --- | --- |
| `send-payment-received` | `` `K & N Gas Services` `` | 125 | none — literal is inlined in the message body |
| `send-deposit-reminder` | `"K & N Gas Services"`, `"087 3686252"` | 81, 82 | `tenant_integrations(360messenger).config.company_name` / `.company_phone` |
| `send-area-bulk-whatsapp` | `"K & N Gas Services"`, `"087 3686252"` | 113, 114 | same, via REST fetch; overwritten only `if (cfg?.company_name)` / `if (cfg?.company_phone)` |
| `trigger-outstanding-reminder` | `"K & N Gas Services"`, `"087 3686252"` | 103, 104 | same, via supabase client `maybeSingle()` |

**No Stripe or payment-link literal in any of the four — confirmed.** `send-deposit-reminder` does include a payment link, but it is the per-job `service_calls.payment_link` column and the query already filters `.not("payment_link", "is", null)` (line 41), so there is no shared-link fallback to remove.

Note the truthiness bug in the existing reads: `?? "K & N..."` and `if (cfg?.company_phone)` both treat `""` as "use K&N". That is exactly why Cavan Gas currently leaks K&N's number.

## Confirmed current state — B2c

All three read `settings.message_footer` correctly by `organisation_id` and fall back to the same literal:

| Function | Literal | Line | Read |
| --- | --- | --- | --- |
| `send-quote-whatsapp` | `"K&N Gas Services"` | 88 | REST `settings?organisation_id=eq.{orgId}&select=message_footer` (90-95) |
| `send-certificate-whatsapp` | `"K&N Gas Services"` | 135 | REST `select=message_footer,template_certificate` (141-146) |
| `send-hazard-whatsapp` | `"K&N Gas Services"` | 103 | REST `select=message_footer` (105-110) |

Every tenant except K&N already has a non-blank `message_footer`, so removing the fallback changes no live behaviour today — but Cavan Gas's footer value is *wrong* (see data step below), which the fallback removal would not catch.

## Live config, as read now

`tenant_integrations(360messenger).config`:

```text
K&N Gas Services  {"company_name":"K & N Gas Services","company_phone":"087 3686252","country_code":"353","api_key_secret":"THREESIXTY_API_KEY"}
Cavan Gas         {"company_name":"Cavan Gas","company_phone":"","country_code":"353","api_key_secret":"THREESIXTY_API_KEY_CAVAN_GAS"}
Dublin Gas        {"company_name":"Dublin Gas","company_phone":"014412618", ...}
Webliveview Ltd   {"company_name":"Webliveview Ltd","company_phone":"0872354257", ...}
```

`settings`:

```text
Cavan Gas        business_name="Cavan Gas"        business_phone="086  222222"   company_phone="0872354257"  message_footer="K&N Gas Services"
Dublin Gas       business_name="Dublin Gas "     business_phone="01 2121211"    company_phone="01 5433433"  message_footer="Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433"
K&N Gas Services business_name="K & N Gas Services" business_phone="087 368 5252"  company_name=NULL  company_phone=NULL  message_footer="K&N Gas Services"
Webliveview Ltd  business_name="Webliveview Ltd" business_phone="0872354257"    company_phone="0872354257"  message_footer="Webliveview Ltd | ... | 0872354257"
```

Important for the diff: **K&N's `settings.company_name` and `settings.company_phone` are NULL.** So the guards must keep sourcing from the 360messenger config (as these four already do), not switch to `settings.company_*`, or K&N itself would start skipping.

## Proposed diffs — B2b (skip-and-log, matching B1/B2a)

Shared pattern, identical in shape to `send-extrawork-payment-link` lines 80-103: read, `String(...).trim()`, blank check, `edge_function_logs` insert, HTTP 200 with `skipped: true`.

**1. `send-payment-received`** — add the config read that this function is missing, then guard before the message is built (line ~116) and before the send:

```diff
+    const { data: messengerConfig } = await supabase
+      .from("tenant_integrations")
+      .select("config")
+      .eq("organisation_id", job.organisation_id)
+      .eq("integration_type", "360messenger")
+      .maybeSingle();
+    const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();
+
+    if (!companyName) {
+      await supabase.from("edge_function_logs").insert({
+        function_name: "send-payment-received",
+        error_message: "Skipped: company_name_not_configured for organisation",
+        payload: { organisation_id: job.organisation_id, service_call_id, reason: "company_name_not_configured" },
+      });
+      return json({ success: false, whatsapp_sent: false, skipped: true, reason: "company_name_not_configured" }, 200);
+    }
@@
-      `K & N Gas Services`;
+      companyName;
```

(No phone guard here — the current message has no phone line, so none is added.)

**2. `send-deposit-reminder`** (lines 81-84) — per-job loop, so a blank config skips that job and continues rather than aborting the batch:

```diff
-      const companyName = (messengerConfig?.config as any)?.company_name ?? "K & N Gas Services";
-      const companyPhone = (messengerConfig?.config as any)?.company_phone ?? "087 3686252";
+      const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();
+      const companyPhone = String((messengerConfig?.config as any)?.company_phone ?? "").trim();
+      const missingConfig = !companyName
+        ? "company_name_not_configured"
+        : !companyPhone ? "company_phone_not_configured" : null;
+      if (missingConfig) {
+        await supabase.from("edge_function_logs").insert({
+          function_name: "send-deposit-reminder",
+          error_message: `Skipped: ${missingConfig} for organisation`,
+          payload: { organisation_id: orgId, service_call_id: job.id, reason: missingConfig },
+        });
+        skipped++;
+        continue;
+      }
```

Skip happens before the `message_log` insert, so no pending rows are orphaned.

**3. `send-area-bulk-whatsapp`** (lines 113-122) — same, inside the per-customer loop; the skipped recipient is counted as skipped and one log row is written per skipped org-batch (deduped with a flag so a 200-customer bulk run doesn't write 200 identical log rows):

```diff
-      let companyName = "K & N Gas Services";
-      let companyPhone = "087 3686252";
+      const companyName = String(cfg?.company_name ?? "").trim();
+      const companyPhone = String(cfg?.company_phone ?? "").trim();
+      // guard + single deduped edge_function_logs insert, then continue
```

Also proposed: hoist the `tenant_integrations` fetch out of the loop — it currently re-fetches identical config once per recipient.

**4. `trigger-outstanding-reminder`** (lines 103-104) — guard before the Make webhook POST, mirroring the existing `webhook_url_not_configured` shape already at line 90:

```diff
-    const companyName = (messengerIntegration as any)?.config?.company_name ?? "K & N Gas Services";
-    const companyPhone = (messengerIntegration as any)?.config?.company_phone ?? "087 3686252";
+    const companyName = String((messengerIntegration as any)?.config?.company_name ?? "").trim();
+    const companyPhone = String((messengerIntegration as any)?.config?.company_phone ?? "").trim();
+    const missingConfig = !companyName
+      ? "company_name_not_configured"
+      : !companyPhone ? "company_phone_not_configured" : null;
+    if (missingConfig) { /* edge_function_logs insert + 200 { skipped: true, reason } */ }
```

## Proposed diffs — B2c (footer only)

Identical change in all three, at lines 88 / 135 / 103. Guard placed after the settings fetch and before the message is assembled:

```diff
-    let messageFooter = "K&N Gas Services";
+    let messageFooter = "";
@@
+    messageFooter = String(messageFooter).trim();
+    if (!messageFooter) {
+      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
+        method: "POST", headers: dbHeaders,
+        body: JSON.stringify({
+          function_name: "send-quote-whatsapp",
+          error_message: "Skipped: message_footer_not_configured for organisation",
+          payload: { organisation_id: orgId, reason: "message_footer_not_configured" },
+        }),
+      });
+      return new Response(
+        JSON.stringify({ success: false, whatsapp_sent: false, skipped: true, reason: "message_footer_not_configured" }),
+        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
+      );
+    }
```

These three use raw REST rather than the supabase client, so the log insert is a REST POST with the existing `dbHeaders` — no new client, no new import.

## Separate step — Cavan Gas data correction (not bundled with code)

Two wrong values, applied as their own change after the code lands:

- `settings.message_footer` for Cavan Gas is `"K&N Gas Services"` → clear it, or set Cavan Gas's own footer text. Clearing it means the B2c functions will skip for Cavan Gas until a real footer is entered, which is the intended fail-safe. Confirm which you want before it runs.
- `tenant_integrations(360messenger).config.company_phone` for Cavan Gas is `""` → set to Cavan Gas's real number. `settings.company_phone` says `0872354257` and `settings.business_phone` says `086  222222` (with a double space). These disagree, so I need you to confirm the correct one rather than guessing.

Nothing here touches K&N's rows.

## Open questions before implementation

1. Cavan Gas footer — clear it (fail-safe skip) or set real footer text now?
2. Cavan Gas phone — `0872354257`, `086 222222`, or something else?
3. `send-area-bulk-whatsapp`: confirm one deduped log row per bulk run rather than one per skipped recipient.
