# READ-ONLY AUDIT — warranty welcome prerequisites

Commit: `bf269e248` on branch `edit/edt-3f9442ad…` (a working branch managed by the platform; I could not confirm this commit is on `dev`). Nothing was changed.

## 1. Paths that set service_calls.payment_status to paid
There is only one place that writes the value: `supabase/functions/_shared/paymentUpdate.ts:178`, which sets `patch.payment_status = outstanding > 0 ? "partial" : "paid";` (lowercase `"paid"`, `full`/`balance` branch only). Other values it writes: `"unpaid"` at :133 and `"partial"` at :146.
Paths that call it and can reach `"paid"`:
- SumUp webhook: `_shared/sumupWebhook.ts:575` (`type: fullyPaid ? "full" : "balance"`), called from `sumup-payment-webhook/index.ts`
- Office Take Payment: `src/components/payments/TakePaymentModal.tsx:264` (`type: paymentType`, where anything other than a deposit settles the job)
- Engineer app: `src/lib/engineerPaymentPlan.ts:109` (`type: "full"`), applied by `src/hooks/useEngineerJobs.ts` (~:392) and `src/pages/engineer/EngineerJobDetail.tsx` (~:349)

Other callers never produce `"paid"`: NewJobPanel.tsx:1700 (booking_setup), ExtraWorkSheet.tsx:130 (increment), TakePaymentModal.tsx:145 and engineerPaymentPlan.ts:82 (invoice).
No RPC or DB trigger writes `payment_status`. `accept-quote` and `quoteApprovalRecovery` only read it.
Paths that mark something paid WITHOUT setting `payment_status`:
- `NewJobPanel.tsx:1700` with depositMode `"paid"`: sets `deposit_paid=true` and `balance_due=null`, but leaves `payment_status` unset
- `QuotePanel.tsx:364`: sets the **quote** status to `"Paid"` (capital P) plus `paid_at`, on the quotes table, not on the job
- Make Scenario 5 (external): creates SumUp checkouts directly. Settlement still arrives through the webhook above

## 2. K&N job_type counts (raw)
```text
Boiler Service 327 | Boiler Repair 37 | Repair 36 | Emergency 28 | Boiler Replacement 27
Installation 15 | Install 7 | Other 3 | Emergency Call-Out 2
```
Tags on K&N jobs (service_call_tags → job_tags):
```text
New Boiler Fitted 53 | New Boiler Soon 22 | Under Warranty 9
```

## 3. Install-like K&N jobs, last 180 days
Filter: job_type ILIKE `%install%` / `%replace%` / `%new boiler%`, by created_at.
```text
jobs 37 | distinct customers 11 | boiler_brand 9 | boiler_model 7 | warranty_years 7 | boiler_installation_date 6
```

## 4. Triggers on public.service_calls
```text
set_job_reference               BEFORE INSERT        generate_job_reference
trg_log_job_booked_activity     AFTER  INSERT        log_job_booked_activity
trg_log_job_completed_activity  AFTER  UPDATE        log_job_completed_activity
trg_notify_on_job_change        AFTER  INSERT,UPDATE notify_on_job_change
trg_sync_invoice_status_from_job AFTER UPDATE        sync_invoice_status_from_job  (acts on the transition into 'paid')
update_service_calls_updated_at BEFORE UPDATE        update_updated_at_column
```

## 5. pg_cron
None of the job commands contain a literal key. Every HTTP job reads `x-webhook-secret` from the vault entry `cron_shared_secret`, so there was nothing to redact.
```text
2   send-deposit-reminder-daily            0 9 * * *  active  POST /functions/v1/send-deposit-reminder
3   warranty-auto-send                     0 9 * * *  active  POST /functions/v1/warranty-auto-send
6   quote-followup-day3                    0 9 * * *  active  POST /functions/v1/quote-followup-day3
7   quote-followup-day6                    0 9 * * *  active  POST /functions/v1/quote-followup-day6
9   job-reminder-2day-0900-dublin          0 9 * * *  active  POST /functions/v1/job-reminder-2day
230 purge-old-read-notifications           30 3 * * * active  SELECT public.purge_old_read_notifications();
488 sweep-stale-accepted-deliveries-hourly 7 * * * *  active  SELECT public.sweep_stale_accepted_deliveries();
577 purge-activity-logs                    20 3 * * * active  SELECT public.purge_activity_logs();
```
The HTTP jobs all send the header `'Content-Type': 'application/json'`, the header `'x-webhook-secret'`, the body `{"scheduled":true}` and a 55000 ms timeout.
**cron.job_run_details: NOT OBTAINED.** I tried two queries (the second was limited to the last 3 days) and both timed out. I have no run history to report.

## 6. Where customers.warranty_years is written
- `src/components/customer/AddCustomerSheet.tsx:133` and `:181`: the form value, falling back to `DEFAULT_WARRANTY_YEARS`
- `src/pages/CustomerDetail.tsx:705` and `:708`: typed in manually by the office
- `src/pages/ImportCustomers.tsx:456`: taken from the CSV column "warranty years"/"warranty"
- `src/pages/WarrantyDetail.tsx:63` and `:71`: reads it from `boiler_brands` by brand/model (the save line is not quoted here)

No Edge Function, trigger or payment path writes it.

## 7. Helper signatures
- `_shared/whatsapp.ts:2` `getWhatsAppConfig(supabase: any, organisationId: string)` → `{apiKey, phoneNumberId, wabaId}` (throws if the key is missing)
- `_shared/whatsapp.ts:20` `normalisePhone(raw: string): string`
- `_shared/whatsapp.ts:29` `logWhatsAppFailure(supabase: any, row: {...})`
- There is no send function in this file
- `_shared/orgBranding.ts`: `resolveOrgBranding(input)` :124, `getCanonicalOrgBranding` :213, `getCanonicalOrgBrandingRest` :249, `toLegacyBranding` :307, `getOrgBranding` :332, `getOrgBrandingClient` :348, `BRANDING_PRECEDENCE` :30, `LEGACY_NAME_DEFAULT="our team"` :305, `BrandingScopeError` :94
- `_shared/machineAuth.ts:124` `requireMachineCaller(req: Request, corsHeaders: Record<string,string>, fnName: string): Promise<Response|null>`
  - Also exported: `requireMachineOrUser` :147, `resolveCaller` :186, `isMachineCaller` :113
- send-warranty-whatsapp imports `fetchWhatsappApiKey(supabaseUrl: string, serviceRoleKey: string, orgId: string): Promise<WhatsappKeyResolution>` from `_shared/whatsappCredentials.ts:97`
  - It also uses `getOrgBranding`, `evaluateOptOut` and `requireMachineOrUser`
  - Related exports: `resolveWhatsappApiKey` :33 and `fetchWhatsappApiKeyWithClient` :119

Audit stopped here. No fixes proposed.

---

# READ-ONLY AUDIT — Dublin Gas (f1950683-e8b9-41cf-8972-2aa59516850d)

## 1. job_type counts
```text
Boiler Service 54 | Boiler Replacement 16 | Emergency 15 | Repair 13 | Boiler Repair 11
other 8 | Other 4 | Installation 3 | Install 2 | Heating Upgrade 2 | Service 1
```

## 2. Tags on Dublin Gas jobs
```text
New Boiler Fitted 2 (organisation_id NULL) | Under Warranty 1 (NULL) | New Boiler Soon 1 (NULL)
```
Columns in job_tags: `id uuid NOT NULL`, `name text NOT NULL`, `colour text NOT NULL`, `created_at timestamptz NOT NULL`, `organisation_id uuid NULLABLE`.
The table allows per-org tags because organisation_id is nullable. All tags used on Dublin Gas jobs have organisation_id = NULL, which means they are shared across companies.

## 3. tenant_integrations (config key names only, all rows active)
```text
tally         [new_booking_url, renewal_form_url, webhook_secret]
stripe        [payment_link, payment_link_url, webhook_secret]
make          [rebook_webhook_url, review_webhook_secret, review_webhook_url, webhook_secret]
360messenger  [api_key_secret, company_name, company_phone, country_code, webhook_secret]  api_key_secret = THREESIXTY_API_KEY_DUBLIN_GAS
whatsapp      [api_key, domain, phone_number_id, template_prefix, templates, waba_id, webhook_secret]
settings      [company_name, company_phone, google_review_url, webhook_secret]
sumup         [api_key_secret, environment, environments, merchant_code, webhook_secret]  api_key_secret = SUMUP_API_KEY_DUBLIN_GAS
```
Does fetchWhatsappApiKey resolve a key? Yes, if the secret is set in the function environment. It prefers the 360messenger row and resolves to `secret:THREESIXTY_API_KEY_DUBLIN_GAS`. I did not read the function environment in this audit; workspace notes say that secret is live. If the secret were missing, the function would use the `whatsapp` row, which has a literal `config.api_key`, giving `literal_config:whatsapp` (_shared/whatsappCredentials.ts:61-68).

## 4. getCanonicalOrgBranding (from the settings row using the resolver's precedence rules; I did not call the function)
```text
org_name  = "Dublin Gas"   (settings.business_name, stored as "Dublin Gas " — clean() trims)
org_phone = "014412618"    (settings.business_phone; company_phone "01 5433433" not used)
footer    = "Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433"  (settings.message_footer)
```
The phone in the footer (01 5433433) is different from the resolved org_phone (014412618).

## 5. cron.job_run_details (by runid, no timeout)
```text
jobid status    start_time                     return_message
7     succeeded 2026-09-28 09:00:00.301261+00  1 row
9     succeeded 2026-09-28 09:00:00.299461+00  1 row
3     succeeded 2026-09-28 09:00:00.308277+00  1 row
6     succeeded 2026-09-28 09:00:00.296452+00  1 row
(identical pattern for 27/09, 26/09, 25/09, 24/09 — all succeeded, "1 row")
```
"1 row" only means pg_net queued the HTTP request. It does not show what the function returned.

## 6. edge_function_logs (last 5 per function)
```text
warranty-auto-send  2026-09-28 09:00:05.570524+00  OK
warranty-auto-send  2026-09-27 09:00:04.213041+00  OK
warranty-auto-send  2026-09-26 09:00:09.313589+00  OK
warranty-auto-send  2026-09-25 09:00:04.979271+00  OK
warranty-auto-send  2026-09-24 09:00:07.769208+00  OK
quote-followup-day3 (no rows)
quote-followup-day6 (no rows)
```
