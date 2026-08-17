# BJ — send-warranty-whatsapp: remove K&N Tally fallback

Time-sensitive: `warranty-auto-send` is scheduled again and fires at 09:00 tomorrow.

## The problem

`send-warranty-whatsapp` hardcodes K&N's booking form as a fallback:

```
line 90:  let tallyFormBase = "https://tally.so/r/RGJDy4";
line 98:  if (cfg?.renewal_form_url) tallyFormBase = cfg.renewal_form_url;
```

Any tenant without a configured `renewal_form_url` silently sends its customers to K&N's
booking form. Confirmed live config in `tenant_integrations` (integration_type = tally):

| Organisation | renewal_form_url |
| --- | --- |
| K&N Gas Services | https://rebook.kngasservices.ie/ |
| Dublin Gas | https://tally.so/r/Zjgxva |
| Cavan Gas | (empty string) |
| Webliveview Ltd | (null) |

Two of four tenants would hit the K&N fallback.

## The fix

Same skip-and-log pattern already used in `send-payment-received` for missing branding:

- Remove the hardcoded default. Resolve `renewal_form_url` from the tenant's tally config only.
- If it is missing, empty, or the lookup fails: do not send. Return HTTP 200 with
  `{ skipped: true, reason: "missing_renewal_form_url", organisation_id }` and write one
  `message_log` row recording the skip, so it is visible rather than silent.
- Also guard the branding name: if `branding.name` resolves to the generic `"our team"`
  default (no `business_name`/`company_name` in `settings`), skip the same way with reason
  `missing_branding` rather than sending an unbranded warranty message.
- No change to `warranty_day14` / `warranty_day28` copy, phone formatting, opt-out handling,
  or the 360 Messenger send path.

Effect on the 09:00 run: K&N and Dublin Gas send exactly as they do today; Cavan Gas and
Webliveview are skipped with a logged reason instead of leaking K&N's form.

## Verification

1. Unit-level check of the guard: warranty send for Cavan Gas returns `skipped: true` /
   `missing_renewal_form_url` and sends nothing.
2. Positive path for K&N against a scratch test customer only (per the standing
   live-path rule — no real customers), confirming the URL is `rebook.kngasservices.ie`.
3. Confirm `message_log` shows the skip row for the Cavan Gas attempt.
4. Raw output pasted for each step.

## Not in this change

- Populating Cavan Gas / Webliveview `renewal_form_url` — that is tenant config, needs the
  real form URLs from you.
- `send-warranty-whatsapp` remains reachable only via the cron'd `warranty-auto-send` and
  the manual Renewals UI action; no auth changes here.

## Technical notes

- File: `supabase/functions/send-warranty-whatsapp/index.ts` (lines 90-101 for the lookup,
  118-125 for branding/message assembly).
- Skip logging reuses `_shared/logMessage.ts`, matching the B2b/B2c guards.
- No migration, no schema change, no cron change.
