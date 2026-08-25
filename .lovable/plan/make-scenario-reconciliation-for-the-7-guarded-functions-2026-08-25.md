# Make scenario reconciliation for the 7 guarded functions

No code change is needed: every guarded function already accepts `x-webhook-secret: <MAKE_WEBHOOK_SECRET>` (and `x-make-secret` as an alias). Since you hold the secret value, this is a configuration sweep in Make, not a fix here. The `401 invalid_token` on the Dublin Gas 30-day scenario means it sent an `Authorization: Bearer` token that is not a valid user JWT or the service-role key — almost certainly the publishable/anon key, which the guard now rejects by design.

## What the code and database tell us

Callers inside this project (JWT-authenticated, unaffected):

- `send-payment-received` — `src/components/payments/TakePaymentModal.tsx`, `src/pages/engineer/EngineerJobDetail.tsx`

Scheduled jobs in the database: 6 cron entries (`job-reminder-2day`, `quote-followup-day3`, `quote-followup-day6`, `send-deposit-reminder-daily`, `warranty-auto-send`, `purge-old-read-notifications`). **None** of them call any of the 7 guarded functions.

So the only callers of `get-tomorrows-jobs`, `get-upcoming-jobs`, `get-outstanding-invoices` and `renewal-reminder-7/14/30` are Make scenarios. Edge HTTP logs only retain about the last hour, so the historical evidence comes from `message_log`.

## Evidence of which reminder paths actually fire, per tenant

| Path | K&N Gas | Dublin Gas |
|---|---|---|
| `renewal_reminder_30day` | 19 sends, last 10 Aug | none ever |
| `renewal_reminder_14day` | 7 sends, last 20 Aug | none ever |
| `renewal_reminder_7day` | none ever | none ever |
| `renewal_reminder` (legacy/generic) | 34 sends, last 10 Aug | none ever |
| `job_reminder_2day` (cron, unguarded) | 13 sends | 1 send |
| `booking_confirmation` | 217 | 71 |

Two things follow: Dublin Gas has never produced a single renewal-reminder message under any cadence, so its renewal scenarios have either never fired successfully or were only recently switched on — the 401 may be the first time this scenario ever reached the function. And nothing anywhere has ever sent a 7-day renewal, so that cadence's scenario is either absent or has never matched a customer.

## Reconciliation checklist to work through in Make

For each tenant (K&N Gas, Dublin Gas), for each of the six externally-called functions:

```text
get-tomorrows-jobs        header present?  y/n   last successful run
get-upcoming-jobs         header present?  y/n   last successful run
get-outstanding-invoices  header present?  y/n   last successful run
renewal-reminder-30       header present?  y/n   last successful run
renewal-reminder-14       header present?  y/n   last successful run
renewal-reminder-7        header present?  y/n   last successful run
```

For each: add `x-webhook-secret` with your existing secret value, remove any `Authorization: Bearer <anon key>` header (harmless but misleading), then run the scenario once manually and confirm a 200 rather than waiting for its schedule.

## Follow-up I can do here on request

- Re-check `message_log` after your sweep to confirm each cadence produced sends for both tenants.
- Confirm whether a 7-day renewal cadence should exist for either tenant at all, since it has never sent anything.
- Watch the live edge HTTP logs while you manually fire a scenario, to read the exact status and rejection reason as it happens.
