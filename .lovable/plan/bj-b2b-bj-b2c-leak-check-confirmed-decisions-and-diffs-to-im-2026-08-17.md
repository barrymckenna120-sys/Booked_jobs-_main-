# BJ-B2b / BJ-B2c — leak check, confirmed decisions, and diffs to implement

## Leak check ran first: no real customer was ever affected

Every message type these three functions write, joined to organisations:

```text
K&N Gas Services  renewal (send-area-bulk-whatsapp)   29 sent, 1 failed   2026-04-02 -> 2026-05-25
K&N Gas Services  deposit_reminder                     6 failed (0 sent)
Dublin Gas        renewal_reminder                    12 sent             2026-07-09 -> 2026-07-20
Dublin Gas        outstanding_invoice_reminder         1 pending
K&N Gas Services  outstanding_invoice_reminder         5 pending
```

`message_log` row totals per org:

```text
Cavan Gas         0
Webliveview Ltd   0
wexford gas       0
Dublin Gas        176
K&N Gas Services  762
```

Cavan Gas — the only tenant with a blank `company_phone` — has **zero** message_log rows. So the K&N-phone fallback has never reached a real customer on any tenant: every actual send came from K&N (its own details) or Dublin Gas (its own non-blank config). The leak is latent, not realised. It still gets closed.

## Confirmed decisions

- Cavan Gas `settings.message_footer` -> clear to empty.
- Cavan Gas `tenant_integrations(360messenger).config.company_phone` -> clear to empty, rather than guessing between the three disagreeing values.
- Both applied as a separate data step, after the code lands.
- `send-area-bulk-whatsapp`: one deduped log row per bulk run per org, not one per skipped recipient.

## Confirmed current state — B2b

| Function | Literal(s) | Line(s) | Sources today |
| --- | --- | --- | --- |
| `send-payment-received` | `` `K & N Gas Services` `` | 125 | none — literal is inlined in the message body |
| `send-deposit-reminder` | `"K & N Gas Services"`, `"087 3686252"` | 81, 82 | `tenant_integrations(360messenger).config.company_name` / `.company_phone` |
| `send-area-bulk-whatsapp` | `"K & N Gas Services"`, `"087 3686252"` | 113, 114 | same, via REST fetch; overwritten only `if (cfg?.company_name)` / `if (cfg?.company_phone)` |
| `trigger-outstanding-reminder` | `"K & N Gas Services"`, `"087 3686252"` | 103, 104 | same, via supabase client `maybeSingle()` |

No Stripe or payment-link literal in any of the four. `send-deposit-reminder` includes a link, but it is the per-job `service_calls.payment_link` column, already filtered `.not("payment_link", "is", null)` at line 41.

## Confirmed current state — B2c

| Function | Literal | Line | Read |
| --- | --- | --- | --- |
| `send-quote-whatsapp` | `"K&N Gas Services"` | 88 | REST `settings?organisation_id=eq.{orgId}&select=message_footer` (90-95) |
| `send-certificate-whatsapp` | `"K&N Gas Services"` | 135 | REST `select=message_footer,template_certificate` (141-146) |
| `send-hazard-whatsapp` | `"K&N Gas Services"` | 103 | REST `select=message_footer` (105-110) |

Important: K&N's `settings.company_name` / `settings.company_phone` are NULL, so the B2b guards keep sourcing from the 360messenger config (as those functions already do) rather than switching to `settings.company_*`.

## Diffs — B2b (skip-and-log, matching B1/B2a)

Shared shape, same as `send-extrawork-payment-link` lines 80-103: read, `String(...).trim()`, blank check, `edge_function_logs` insert, HTTP 200 with `skipped: true`.

**1. `send-payment-received`** — add the missing config read, guard before the message is built, use the sourced name in the sign-off:

```diff
+    const { data: messengerConfig } = await supabase
+      .from("tenant_integrations")
+      .select("config")
+      .eq("organisation_id", job.organisation_id)
+      .eq("integration_type", "360messenger")
+      .maybeSingle();
+    const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();
+    if (!companyName) {
+      await supabase.from("edge_function_logs").insert({ ... reason: "company_name_not_configured" });
+      return json({ success: false, whatsapp_sent: false, skipped: true, reason: "company_name_not_configured" }, 200);
+    }
@@
-      `K & N Gas Services`;
+      companyName;
```

No phone guard — the current message has no phone line.

**2. `send-deposit-reminder`** (lines 81-84) — per-job loop, so a blank config increments `skipped` and `continue`s, before the `message_log` insert so no pending rows are orphaned:

```diff
-      const companyName = (messengerConfig?.config as any)?.company_name ?? "K & N Gas Services";
-      const companyPhone = (messengerConfig?.config as any)?.company_phone ?? "087 3686252";
+      const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();
+      const companyPhone = String((messengerConfig?.config as any)?.company_phone ?? "").trim();
+      const missingConfig = !companyName ? "company_name_not_configured"
+        : !companyPhone ? "company_phone_not_configured" : null;
+      if (missingConfig) { /* edge_function_logs insert; skipped++; continue; */ }
```

**3. `send-area-bulk-whatsapp`** (lines 113-122) — hoist the `tenant_integrations` fetch into a per-org cache (it currently refetches identical config once per recipient), guard, and write exactly one log row per org per run via a `loggedSkipOrgs` set:

```diff
-      let companyName = "K & N Gas Services";
-      let companyPhone = "087 3686252";
+      const { companyName, companyPhone } = await getBranding(orgId);   // cached per org
+      const missingConfig = !companyName ? "company_name_not_configured"
+        : !companyPhone ? "company_phone_not_configured" : null;
+      if (missingConfig) {
+        if (!loggedSkipOrgs.has(orgId)) { /* single edge_function_logs insert */ loggedSkipOrgs.add(orgId); }
+        skipped++; byArea[areaKey].skipped++; continue;
+      }
```

**4. `trigger-outstanding-reminder`** (lines 103-104) — guard before the Make webhook POST, reusing the existing `logFailure` helper and mirroring the `webhook_url_not_configured` 200 shape at line 90:

```diff
-    const companyName = (messengerIntegration as any)?.config?.company_name ?? "K & N Gas Services";
-    const companyPhone = (messengerIntegration as any)?.config?.company_phone ?? "087 3686252";
+    const companyName = String((messengerIntegration as any)?.config?.company_name ?? "").trim();
+    const companyPhone = String((messengerIntegration as any)?.config?.company_phone ?? "").trim();
+    const missingConfig = !companyName ? "company_name_not_configured"
+      : !companyPhone ? "company_phone_not_configured" : null;
+    if (missingConfig) { await logFailure(...); return 200 { skipped: true, reason: missingConfig }; }
```

## Diffs — B2c (footer only)

Same change at lines 88 / 135 / 103. These three use raw REST, so the log insert is a REST POST with the existing headers — no new client, no new import:

```diff
-    let messageFooter = "K&N Gas Services";
+    let messageFooter = "";
@@
+    messageFooter = String(messageFooter).trim();
+    if (!messageFooter) {
+      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, { method: "POST", headers: dbHeaders,
+        body: JSON.stringify({ function_name: "<this function>",
+          error_message: "Skipped: message_footer_not_configured for organisation",
+          payload: { organisation_id: orgId, reason: "message_footer_not_configured" } }) });
+      return new Response(
+        JSON.stringify({ success: false, whatsapp_sent: false, skipped: true, reason: "message_footer_not_configured" }),
+        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
+      );
+    }
```

## Separate data step (after the code)

Two updates, Cavan Gas only, nothing touching K&N:

- `settings.message_footer` -> `''` (currently the wrong `"K&N Gas Services"`)
- `tenant_integrations(360messenger).config.company_phone` -> `''` (already `""`, re-asserted with the footer change so both land as one reviewed data step)

Cavan Gas will then skip-and-log on these paths until real values are entered, which is the intended fail-safe.

## Verification

- `rg` across all seven files for `K & N Gas Services`, `K&N Gas Services`, `087 3686252` — expect zero hits.
- Live-path checks on scratch jobs / test recipients only, never a real customer's number.
- Paste raw response bodies, raw `edge_function_logs` rows, and raw grep output.
