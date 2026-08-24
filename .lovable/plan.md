# BookedJobs OWASP Security Audit — Audit Only (no changes made)

Everything below was confirmed this turn by querying the live database (policies, buckets, storage policies), the security scanner, the Supabase linter, and reading `supabase/config.toml` + all 85 edge functions. Nothing was modified.

## Findings

| Sev | Area | Finding | Risk | Where | Recommended fix |
|---|---|---|---|---|---|
| P0 | Edge Functions | `create-job-invoice` accepts `job_id` from the request body, runs on the service-role key, and has **no auth guard and no caller-org check** (`verify_jwt` not set → false) | Anyone with any job UUID can raise a real invoice on another tenant's job, generate its PDF and WhatsApp it to that tenant's customer | `supabase/functions/create-job-invoice/index.ts:50,57` | Add `authoriseRequest` (JWT or `x-webhook-secret`) + assert `get_my_org_id()` matches `job.organisation_id` |
| P0 | Edge Functions | `send-whatsapp-receipt` — same pattern: body `job_id`, service role, no guard | Unauthenticated party can send WhatsApp messages to any tenant's customer and enumerate receipts/PDF links | `send-whatsapp-receipt/index.ts:18-34` | Same guard + tenant match; rate limit |
| P0 | Edge Functions | `generate-receipt-pdf` — body `job_id`, service role, no guard | Financial data (revenue, customer, engineer) rendered to a retrievable PDF for any job UUID | `generate-receipt-pdf/index.ts:27-42` | Same guard + tenant match |
| P0 | Edge Functions | 54 service-role functions have **zero** authentication/secret/JWT check. Cron-only ones (`warranty-auto-send`, `send-outstanding-invoice-reminders`, `quote-followup-day3/6`, `job-reminder-2day`, `review-request`, `send-upcoming-reminders`…) are publicly invocable | Anyone can trigger mass WhatsApp/email sends to a tenant's whole customer base (cost, spam, reputational, GDPR) | audit list in report body | Require `x-webhook-secret` for all cron/Make-invoked functions; JWT+org for all UI-invoked ones |
| P1 | Edge Functions | `send-area-bulk-whatsapp` takes `customers` **and** the org from the caller payload, service role | Cross-tenant bulk messaging with attacker-supplied recipient list | `send-area-bulk-whatsapp/index.ts:17-56` | Derive org from JWT; ignore client-supplied recipient lists, re-query by area code within org |
| P1 | Edge Functions | `resolve-document-link` — service role, no guard, resolves stored document paths | Signed URLs for another tenant's certificates/quotes/receipts if the row id is known | `resolve-document-link/index.ts` | Guard + verify the owning row's `organisation_id` before signing |
| P1 | Storage | `quote-pdfs` INSERT/UPDATE is `service_role`-only but has **no ownership join**; SELECT relies purely on folder-name = org id | A future authenticated write path (or a path-traversal in a function) can overwrite another tenant's quote PDF; folder naming is the only isolation | `storage.objects` policies | Join to `quotes.organisation_id` in the policy; keep writes service-role-only |
| P1 | Auth/Roles | Role checks use `get_user_role(auth.uid())` returning a text role stored on `profiles`, not a separate `user_roles` table | Any write path that can update `profiles.role` is a privilege-escalation to office/admin. Triggers exist (`prevent_engineer_role_escalation`, `prevent_superadmin_self_assign`) but this is defence-in-depth, not structural | `profiles`, `get_user_role` | Long-term: move roles to `public.user_roles` + `has_role()`; short-term: confirm no client-side `profiles.role` update is permitted |
| P1 | Edge Functions | CORS `Access-Control-Allow-Origin: "*"` in 77 functions | Combined with the unguarded functions above, any website can invoke them from a victim's browser | all functions | Restrict to the app's origins for JWT-authenticated functions |
| P2 | RLS | `login_attempts` and `org_price_list` have RLS enabled with **0 policies** | Not a leak (fully locked) but `org_price_list` is unreachable from the app — either dead or silently broken pricing | tables | Add org-scoped policies or drop the table |
| P2 | RLS | 23 `SECURITY DEFINER` functions are `EXECUTE`-able by `anon`/`authenticated` (8 by anon) | Public token/quote/receipt lookups are intentional; the rest widen the bypass surface | linter 0028/0029 | Revoke `EXECUTE` from `anon` on everything except the deliberate public-token functions |
| P2 | Payments | No duplicate guard on `job_payments` for `source='office_modal'`; only the SumUp path has a partial unique index. `TakePaymentModal` Confirm button has no in-flight `submitting` lock | Double-click or retry creates duplicate ledger rows and overstated collected totals | `job_payments`, `TakePaymentModal.tsx` | Disable button while in flight + partial unique index on (service_call_id, amount, paid_at) for manual sources |
| P2 | Multi-tenant | `quick_replies` engineer-read policy matches on shared `user_id` rather than `organisation_id` | Potential leak of another engineer's templates within/possibly across orgs | `quick_replies` policies | Rewrite as `organisation_id = get_my_org_id()` |
| P3 | Hygiene | `tmp-mcl-probe`, `backfill-storage-paths`, `whatsapp-webhook-test` deployed with service role and no guard | Debug/backfill endpoints live in production | those functions | Delete them |

### Verified as sound
- **RLS coverage**: all 52 public tables have RLS enabled; every core tenant table (`customers`, `service_calls`, `quotes`, `invoices`, `certificates`, `job_payments`, `whatsapp_messages`, `settings`, `engineers`, `job_media`, `parts_requests`) is gated on `organisation_id = get_my_org_id()`. No table is readable across orgs via the Data API.
- **Storage**: `certificates`, `job-media`, `quote-pdfs` are private; `certificates`/`job-media` policies are org-scoped (`job-media` joins `customers.organisation_id`). `business-logos`/`email-assets` are public by design.
- **Payments**: `payment_status`/`revenue` cannot be set by clients — `stripCallerRevenue()` strips it, and SumUp settlement runs server-side with signature verification plus `sumup_webhook_events` unique `checkout_id` idempotency. Payment secrets are per-org in `tenant_integrations` and never reach the browser.
- **Signup**: invite-only (`disable_signup: true`); new profiles start with `role='engineer'`, `organisation_id NULL`.

## Top 5, in fix order
1. Guard `create-job-invoice`, `generate-receipt-pdf`, `send-whatsapp-receipt` (JWT + org match). Highest blast radius, smallest change.
2. Sweep the remaining 51 unguarded service-role functions: `x-webhook-secret` for cron/Make, JWT+org for UI. Do it in batches of ~10, deploying and smoke-testing each batch.
3. `send-area-bulk-whatsapp` + `resolve-document-link` — derive org server-side, stop trusting client IDs.
4. Delete `tmp-mcl-probe`, `whatsapp-webhook-test`, `backfill-storage-paths`.
5. `quote-pdfs` ownership join + `quick_replies` org scoping + revoke anon `EXECUTE` on non-public definer functions.

## What could break production
- Adding JWT enforcement to a function Make currently calls **without** a secret breaks that automation instantly — inventory every Make scenario's headers before flipping each function.
- Cron-invoked functions call themselves with the service-role key; the guard must accept that path or nightly reminders stop.
- Revoking `anon` `EXECUTE` on the wrong definer function breaks public quote/receipt/booking pages (`get_quote_by_token`, `get_receipt_public`, `get_cert_pdf`, `get_booking_link_by_token` must stay).
- Tightening CORS can break the published domains (`kngasservices.bookedjobs.ie`, `dublin-gas.bookedjobs.ie`) if both aren't allow-listed.

## Tests required per P0/P1
- Cross-tenant negative test per guarded function: call with Dublin Gas's JWT against a K&N `job_id` → expect 403, and assert no row/message written.
- Unauthenticated call with no header → 401.
- Make-path positive test with the correct `x-webhook-secret` → 200.
- Storage: signed-URL request from org A for an org B `quote-pdfs`/`certificates` path → denied.
- Anon RPC probe: each definer function still reachable for public pages, all others 403.
- Regression: one full happy-path job (book → deposit → complete → receipt) per tenant after each batch.

## GO / NO-GO for a second tenant
**NO-GO today.** Database-level isolation is genuinely strong — RLS and storage would hold. The failure is the edge layer: 54 service-role functions accept tenant-owned IDs with no caller authentication, so knowing a UUID is enough to invoice, message and expose another tenant's customers. Adding a third organisation multiplies that exposure and makes it cross-customer rather than internal.

**GO once** items 1–4 above are complete and the cross-tenant negative tests pass. Items 5 and the P2s can follow after onboarding.
