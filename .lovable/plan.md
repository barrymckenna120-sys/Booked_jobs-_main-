# New Gas Boilers Dublin — Tally webhook password

## What I found (read from production, nothing changed)

- The company exists: "New Gas Boilers Dublin", owner Matt Murphy, phone 086 232 2753, email info@newgasboilers.ie, live.
- Form 68qaMe is registered to this company and to no other company.
- A webhook password is configured, but it is held by name only — the company's record points at an encrypted store entry, and the value itself cannot be read back by me, by the app, or by anyone in the interface. That is why you never received it.
- Settings → Integrations today has cards for booking URLs, reviews, Stripe, SumUp and WhatsApp branding. There is no webhook-password control there.
- No enquiry has ever arrived from this form yet, so the connection is unproven.

## Answer to your question

You cannot rotate it from Settings → Integrations today. Two ways forward:

**Option A (recommended, no code, available immediately).** I open a secure password form in this chat. You either paste your own strong password or one you generate in your password manager. It saves straight into the same encrypted store the function already reads, replacing the current value. You hold the value in your clipboard/manager and paste it into Tally's custom header. Nothing appears in chat or logs.

**Option B (build the control you asked for).** Add a "Webhook password" card to Settings → Integrations with Generate, Copy once, and Rotate. Important trade-off: the app cannot write to the encrypted secret store, so a password set in the app has to live on the company's integration record instead — readable by that company's own admins in the database. That is a weaker place for it than where the password sits now. Duplicate protection, form binding and tenant isolation are unaffected either way.

My recommendation is Option A now so you can complete the Tally setup today, and Option B only if you want self-service rotation for every company later.

## Steps for Option A

1. I open the secure password form (one field, this company's Tally webhook password). You enter the value; I never see it.
2. In Tally, on the "Find My Boiler" form: Integrations → Webhooks → add endpoint.
   - URL: `https://ktkfuquqxbrmuqrmbmdj.supabase.co/functions/v1/tally-boiler-enquiry`
   - Custom header name: `x-webhook-secret`
   - Custom header value: the password you just entered
   - Event: new form response
3. I confirm the live function accepts the new password: one signed probe call that must be accepted, and one deliberately wrong password that must be refused. Neither creates a real enquiry.
4. You submit the form once as a clearly fake customer. I read back that the enquiry landed under New Gas Boilers Dublin only, every answer mapped to the right field, photos copied across, and the office was notified.
5. I replay the same submission reference to confirm a Tally retry returns the original enquiry rather than a second one.

No other company, integration, schema, policy or function code is touched.

## Also outstanding

Matt has no login yet — the only office account on this company is `sales@bookedjobs.ie`. Inviting an office user with no engineer record has no route in the app today, so that needs a separate decision.

## Technical notes

- Auth header: `x-webhook-secret` (alias `x-make-secret` kept for legacy Make scenarios). Raw value, no prefix, no signature scheme.
- The function resolves the tenant server-side: the password must match exactly one company, and form id 68qaMe is matched against `boiler_enquiry_form_id` on that company's tally row as a second independent binding. A body-supplied `organisation_id` is accepted only when it equals the server-derived company.
- Rotation for Option A replaces the value behind `config.webhook_secret_name`; the function reads it through `secretEnv` in `orgForSecret`, so no code change is needed and the change takes effect immediately.
- Idempotency: unique partial index on `(organisation_id, external_source, external_submission_id)` plus a pre-check, keyed on Tally's submission id.
- Watch item, not changed here: Tally's webhook timeout is 10 seconds; submissions with several large photos are copied server-side and could approach it. Retries plus idempotency prevent duplicates.
- Roadmap entry for this task will be added when the plan is approved (plan mode does not write other files).
