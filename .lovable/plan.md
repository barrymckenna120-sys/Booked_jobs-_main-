# Pre-launch QA audit — K&N Gas Services Ltd

Target tenant: K&N gas services Ltd (`c0aa41ac-…`), owner karl@bookedjobs.ie. Currently 1 user, 7 customers, 13 jobs, 8 integration rows.

## Important constraint: there is no separate staging environment

Preview and the published app share one backend and one database. "Staging" can only mean a separate **test company** in that same database. It keeps the data separate by company, but it still uses the live WhatsApp, SumUp and email accounts. So:

- **Staging tenant:** Sligo Test Gas (has an owner, 1 customer, 3 jobs). Cavan Gas can't be used as-is because it has no owner, so bookings fail.
- **Configuration:** I'll mirror K&N Ltd's non-secret settings onto the staging tenant (services and prices, message templates, form links, review settings). Each copy is its own reviewed data step. I'll give a before/after read-back, and nothing gets written to K&N Ltd.
- **Messages:** synthetic customers only, using the reserved scratch numbers (a fresh +3538799901xx range, each checked unused first). Any test where the sending path can't be pointed away from a real customer is marked BLOCKED.
- **Payments:** there's no SumUp sandbox; the only merchants are live. Real-card checkout is **BLOCKED** unless you approve one small live charge (then refund). I'll check checkout creation and the webhook without a card.
- **Scheduled automations (cron and Make):** I'll run them by calling the function directly for the staging tenant, with a simulated due date stored on the synthetic customer. I won't edit Make scenarios or schedules.

## Phase 1 — Read-only production inspection (K&N Ltd)

1. Account and users: organisation row, owner link, and the `profiles` / `engineers` / `auth` joins for Karl. Check the company ID is correct on all of them (bug pattern 6).
2. Settings and branding: `settings`, `brand_settings`, business details, VAT, service prices, form links (new booking, rebooking, renewal), Google review link.
3. Integrations: which `tenant_integrations` rows exist, secret names present (not values), WhatsApp key per tenant, SumUp merchant binding (should be M9GH65GY), Tally form IDs.
4. Permissions: role gating for office vs engineer screens and financial data. Check the engineer DOM contains no margin or price data.
5. Automations inventory: every renewal, quote follow-up, outstanding payment, warranty and review function. For each: tenant scoping, opted-out check, idempotency guard, and any fallback to another company's links or keys (known risk: Stripe fallback, K&N Tally URL fallback, broken pg_cron settings).
6. Customer-facing URLs: kngasservices.bookedjobs.ie routes (`/b/…` short links, quote, receipt, cert, booking). Check with HTTP status and screenshots only, using existing public links and no writes.

## Phase 2 — Staging end-to-end (Sligo Test Gas, synthetic data)

- Tally new booking and rebooking, the duplicate-job guard, and customer matching.
- Quote create → send → accept → deposit link creation (no charge).
- Job lifecycle: assign → en route → complete (two-step modal) → invoice → payment recorded in `job_payments`. Check revenue isn't rewritten.
- WhatsApp automations with simulated dates: 30-day and 14-day renewal, quote day-3 and day-6, outstanding invoice reminder, warranty, Google review. Each must produce exactly one message to the scratch number, logged in `message_log`, and an opted-out customer must be skipped.
- Mobile at 390px: engineer Today, job card, bottom nav, Fault Finder entry, payment banner. Office at desktop.
- Destructive scenarios: cancel, reschedule, duplicate submission, bad phone, opted-out customer.

## Phase 3 — Fixes

- Audit first: confirm the root cause with a read-back before any code.
- One concern per fix, ideally 1–3 files, each with one regression test.
- Tested in preview against the staging tenant plus one other tenant.
- No production deploy, no Edge Function deploy that changes live behaviour, and no live data change without your explicit approval per item.

## Phase 4 — Report

A pre-launch report (XLSX plus a short summary) covering:
- **Tests:** passed, failed and BLOCKED, each with evidence (read-back, HTTP status, screenshot or log line).
- **Repairs:** fixes verified in preview.
- **Defects and risks:** unresolved defects with severity, plus release risks. Known examples: Make scenario still sending "Dublin Gas" wording, SumUp key rotation, Tally forms not checking a signature.

## Never touched without explicit approval
Karl's password, K&N Ltd customers, jobs, payment settings, scheduled messages, Make scenarios, and publishing.

## Decisions needed before I start
1. Use **Sligo Test Gas** as staging (recommended), or set an owner on Cavan Gas instead?
2. May I copy K&N Ltd's non-secret settings onto the staging tenant (a data write to the test company only)?
3. Real-card payment test: keep it BLOCKED, or approve one small live charge plus refund?
