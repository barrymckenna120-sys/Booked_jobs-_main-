# READ-ONLY AUDIT (v2): warranty welcome, K&N and Dublin Gas

Commit `5658bd15c` on working branch `edit/edt-6cb8e2b4…`. I can't confirm it is on `dev`, and nothing was changed during this audit.
**Heads-up:** the build approved earlier today (28/09/26) already added the trigger `trg_enqueue_post_payment_messages`, the table `post_payment_messages` and the scheduled job `process-post-payment-messages`. They show up in sections 5 and 6.

## 1. Paths that set payment_status = paid
The value is only ever written in `supabase/functions/_shared/paymentUpdate.ts:178`: `patch.payment_status = outstanding > 0 ? "partial" : "paid";`. It is always lowercase `"paid"`, from the `full`/`balance` branch. The same file writes `"unpaid"` at :133 and `"partial"` at :146.
Callers that can reach `"paid"`:
- SumUp webhook: `_shared/sumupWebhook.ts:575`, called from `sumup-payment-webhook/index.ts` (`type: fullyPaid ? "full" : "balance"`)
- Office Take Payment: `src/components/payments/TakePaymentModal.tsx:264`
- Engineer app: `src/lib/engineerPaymentPlan.ts:109`, applied through `src/hooks/useEngineerJobs.ts` and `src/pages/engineer/EngineerJobDetail.tsx`

Callers that never write "paid": NewJobPanel.tsx:1700 (booking setup), ExtraWorkSheet.tsx:130 (increment), TakePaymentModal.tsx:145 and engineerPaymentPlan.ts:82 (invoice).
No RPC or trigger writes payment_status.
Things that mark something paid without setting `payment_status`:
- `NewJobPanel.tsx:1700` with depositMode "paid" sets `deposit_paid=true` and `balance_due=null` but leaves payment_status unset.
- `QuotePanel.tsx:364` sets the **quote's** status to `"Paid"`, capital P, not the job's.

## 2. job_type counts per org
```text
K&N:        Boiler Service 327 | Boiler Repair 37 | Repair 36 | Emergency 28 | Boiler Replacement 27 | Installation 15 | Install 7 | Other 3 | Emergency Call-Out 2
Dublin Gas: Boiler Service 54 | Boiler Replacement 16 | Emergency 15 | Repair 13 | Boiler Repair 11 | other 8 | Other 4 | Installation 3 | Install 2 | Heating Upgrade 2 | Service 1
```
Tags on each org's jobs (service_call_tags joined to job_tags):
```text
K&N:        New Boiler Fitted 53 | New Boiler Soon 22 | Under Warranty 9
Dublin Gas: New Boiler Fitted 2 | Under Warranty 1 | New Boiler Soon 1   (all job_tags.organisation_id = NULL, i.e. shared)
```
Where the job_type options come from: hardcoded lists in the code, not a per-company table.
- `src/components/jobs/NewJobPanel.tsx:49-54`: Boiler Service, Repair, Emergency, Installation
- `src/components/quotes/QuoteForm.tsx:24`: Boiler Service, Boiler Repair, Boiler Replacement, Heating Upgrade, Power Flush, Other
- `src/components/schedule/UnallocatedJobs.tsx:57`
- `src/pages/Jobs.tsx:688`
- `src/components/engineer/CompleteSheet.tsx:20`
- The Tally intake sets "Boiler Service" at `tally-incoming-job/index.ts:491`.

## 3. Install-like jobs from the last 180 days
Filter used: job_type contains `install`, `replace` or `new boiler`, any casing.
```text
org          jobs customers boiler_brand boiler_model warranty_years boiler_installation_date
K&N          37   11        9            7            7              6
Dublin Gas   21   7         7            6            4              4
```

## 4. Dublin Gas readiness
tenant_integrations (config key names only; every row is active):
```text
tally         [new_booking_url, renewal_form_url, webhook_secret]
stripe        [payment_link, payment_link_url, webhook_secret]
make          [rebook_webhook_url, review_webhook_secret, review_webhook_url, webhook_secret]
360messenger  [api_key_secret, company_name, company_phone, country_code, webhook_secret]  api_key_secret=THREESIXTY_API_KEY_DUBLIN_GAS
whatsapp      [api_key, domain, phone_number_id, template_prefix, templates, waba_id, webhook_secret]
settings      [company_name, company_phone, google_review_url, webhook_secret]
sumup         [api_key_secret, environment, environments, merchant_code, webhook_secret]  api_key_secret=SUMUP_API_KEY_DUBLIN_GAS
```
Branding, worked out from the settings row using the resolver's rules. I read the row; I did not run the function itself.
```text
name   = "Dublin Gas"      (settings.business_name "Dublin Gas " trimmed)
phone  = "014412618"       (settings.business_phone)
footer = "Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433"  (settings.message_footer)
```
Customers: `opted_out=true` 3, total 28.

## 5. Triggers on public.service_calls
The list below was read before this morning's build. The last line was added by that build and has not been read back in this audit.
```text
set_job_reference                 BEFORE INSERT        generate_job_reference
trg_log_job_booked_activity       AFTER  INSERT        log_job_booked_activity
trg_log_job_completed_activity    AFTER  UPDATE        log_job_completed_activity
trg_notify_on_job_change          AFTER  INSERT,UPDATE notify_on_job_change
trg_sync_invoice_status_from_job  AFTER  UPDATE        sync_invoice_status_from_job
update_service_calls_updated_at   BEFORE UPDATE        update_updated_at_column
trg_enqueue_post_payment_messages AFTER  UPDATE OF payment_status  enqueue_post_payment_messages   (added by today's build)
```

## 6. pg_cron
None of the job commands contain a literal key. Every HTTP job reads the header `x-webhook-secret` from the vault entry `cron_shared_secret`.
```text
2   send-deposit-reminder-daily            0 9 * * *    active  POST /functions/v1/send-deposit-reminder
3   warranty-auto-send                     0 9 * * *    active  POST /functions/v1/warranty-auto-send
6   quote-followup-day3                    0 9 * * *    active  POST /functions/v1/quote-followup-day3
7   quote-followup-day6                    0 9 * * *    active  POST /functions/v1/quote-followup-day6
9   job-reminder-2day-0900-dublin          0 9 * * *    active  POST /functions/v1/job-reminder-2day
230 purge-old-read-notifications           30 3 * * *   active  SELECT public.purge_old_read_notifications();
488 sweep-stale-accepted-deliveries-hourly 7 * * * *    active  SELECT public.sweep_stale_accepted_deliveries();
577 purge-activity-logs                    20 3 * * *   active  SELECT public.purge_activity_logs();
659 process-post-payment-messages          */10 * * * * active  POST /functions/v1/process-post-payment-messages  (added today)
```
Run history:
- Jobs 3, 6, 7 and 9, looked up by runid: every run from 24/09 to 28/09 at 09:00 shows `succeeded`, `1 row`. "1 row" only means the HTTP request was queued; it says nothing about what the function returned.
- The other jobs: **not obtained.** The general run-history query timed out earlier.

## 7. Where customers.warranty_years is written
- `src/components/customer/AddCustomerSheet.tsx:133`, `:181`: the form value, falling back to `DEFAULT_WARRANTY_YEARS`
- `src/pages/CustomerDetail.tsx:705`, `:708`: office edits it manually
- `src/pages/ImportCustomers.tsx:456`: CSV column "warranty years" / "warranty"
- No Edge Function or trigger writes it.
- `WarrantyDetail.tsx:57-75` works out the years from `boiler_brands` for display only; it does not save them.

## 8. Helper signatures
- `_shared/whatsapp.ts`
  - :2 `getWhatsAppConfig(supabase: any, organisationId: string)` returns `{apiKey, phoneNumberId, wabaId}` and throws if a value is missing
  - :20 `normalisePhone(raw: string): string`
  - :29 `logWhatsAppFailure(supabase: any, row)`
  - This file has no send function.
- `_shared/orgBranding.ts`
  - `BRANDING_PRECEDENCE` :30
  - `BrandingScopeError` :94
  - `resolveOrgBranding(input: BrandingResolverInput): CanonicalOrgBranding` :124
  - `getCanonicalOrgBranding(supabase, organisationId): Promise<CanonicalOrgBranding>` :213
  - `getCanonicalOrgBrandingRest` :249
  - `LEGACY_NAME_DEFAULT` :305
  - `toLegacyBranding` :307
  - `getOrgBranding` :332
  - `getOrgBrandingClient` :348
- `_shared/machineAuth.ts`
  - :124 `requireMachineCaller(req: Request, corsHeaders: Record<string,string>, fnName: string): Promise<Response|null>`
  - Also exported: `requireMachineOrUser` :147, `resolveCaller` :186
- Key helper used by send-warranty-whatsapp: `_shared/whatsappCredentials.ts:97` `fetchWhatsappApiKey(supabaseUrl: string, serviceRoleKey: string, orgId: string): Promise<WhatsappKeyResolution>`
  - It prefers the 360messenger row's `api_key_secret`. If that fails it uses the literal `config.api_key` from either row.
  - For Dublin Gas this gives `secret:THREESIXTY_API_KEY_DUBLIN_GAS`. I didn't read the function's environment to confirm the secret is set.

The audit stops here. No fixes are proposed.
