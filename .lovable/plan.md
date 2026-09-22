# New Gas Boilers Dublin — Tally intake readiness

## Status check (read from production, nothing changed)

1. Company exists — "New Gas Boilers Dublin", owner Matt Murphy, phone 086 232 2753, email info@newgasboilers.ie, live (not a test company).
2. Form 68qaMe is registered to this company and to no other company.
3. Webhook password is configured and stored encrypted (referenced by name only, never held in the database row).
4. Tally can supply the authentication — its webhook setup allows custom headers, so the password travels in a header, not in the URL.
5. Not yet proven live: no enquiry has ever arrived from this form. The only two enquiries in the system belong to the Cavan test company.

## Remaining setup (in Tally, by you)

On the "Find My Boiler" form, Integrations > Webhooks > add endpoint:

- URL: `https://ktkfuquqxbrmuqrmbmdj.supabase.co/functions/v1/tally-boiler-enquiry`
- Custom header name: `x-webhook-secret`
- Custom header value: the company's webhook password (the value you saved; it is never shown in chat or logs)
- Event: form response / new submission

## Then the live test

1. Submit the form once as a clearly fake customer (e.g. "Test Boiler Customer") — never a real person.
2. I read back the result and confirm: the enquiry was created, it sits under New Gas Boilers Dublin only, every answer landed in the right field, any photos were copied across, and the office was notified.
3. I replay the same submission reference to confirm a Tally retry returns the original enquiry instead of a second one.
4. If the password is wrong, the submission is refused with a logged reason and no partial record — I report that and you re-paste the value.

## Also outstanding

Matt has no login yet. The only office account on this company is `sales@bookedjobs.ie`. Inviting an office user without an engineer record has no route in the app today, so this needs a decision on how you want Matt added.

## Technical notes

- Authentication: `x-webhook-secret` (alias `x-make-secret` accepted for legacy scenarios). Raw value, no prefix, no signature scheme, no Authorization header.
- Tenant resolution stays server-side: the password resolves to exactly one company, and form id 68qaMe is matched against `boiler_enquiry_form_id` on that company's tally integration row as a second independent binding. A body-supplied `organisation_id` is accepted only when it equals the server-derived company.
- Duplicate protection: unique partial index on `(organisation_id, external_source, external_submission_id)` plus an explicit pre-check, keyed on Tally's submission id.
- Known risk to watch, not to change now: Tally's webhook timeout is 10 seconds; submissions with several large photos are copied server-side and could approach it. Tally retries and idempotency prevent duplicates.
- No code, schema, RLS or other tenant is touched by this plan.
