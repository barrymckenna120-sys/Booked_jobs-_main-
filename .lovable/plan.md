# Make quote follow-ups org-agnostic

The day-3 and day-6 quote follow-up WhatsApp messages are the last outbound path still hardcoded to K&N: the sender name "Karl", the company name "K & N Gas Services", the phone `087 368 5252`, and even the area "Dublin 3" are baked into the message text. Any other tenant using quote follow-ups sends messages signed by K&N.

Two related reliability bugs sit in the same code and get fixed in the same pass.

## What changes

**1. Message copy comes from the tenant's own settings**

Both functions will resolve the org's business name and phone from the shared branding helper already used elsewhere, instead of hardcoded strings. "Dublin 3" is dropped entirely — it's a K&N locality that has no business in a shared template.

New copy (day 3):
> Hi {first name}, just checking you got the quote we sent over. Happy to answer any questions or adjust anything if needed.
>
> Thanks,
> {business name}

New copy (day 6):
> Hi {first name}, we wanted to follow up on the quote we sent over. We have some availability coming up if you'd like to go ahead. Reply to this message or call us on {business phone} if you have any questions.
>
> Thanks,
> {business name}

If the org has no phone set, the "call us on…" clause is omitted and the message just invites a reply — the same graceful degradation the renewal reminder uses. If no business name is set, the fallback is the generic "our team".

**2. Delivery success is checked properly**

Right now success is judged on the HTTP status alone. 360Messenger returns HTTP 200 on some failures, so a quote can be marked as "followed up" when nothing was delivered — and it will then never be retried. Both functions will parse the response and check the `success` flag, matching every other WhatsApp send in the app.

**3. WhatsApp key resolution matches the rest of the app**

These two functions read the raw API key straight out of the integration config. Everywhere else reads a secret *name* from config and pulls the actual key from project secrets. Both functions will use the shared resolution path (secret name first, config key as fallback), so a tenant that has been migrated to the secure pattern keeps working instead of silently skipping.

## Not in scope

The 24-hour send window stays as-is (a quote sent 4+ days ago that was missed by a cron run is skipped permanently). That is a real gap, but it changes *which* quotes get messaged rather than what the message says, so it's better handled as its own change.

## Data note

K&N's `business_phone` in settings is currently the incomplete value `087 ` — that needs correcting in Settings before this ships, otherwise day-6 messages will read "call us on 087". Every other active tenant has a usable phone.

## Technical detail

- Both `supabase/functions/quote-followup-day3/index.ts` and `quote-followup-day6/index.ts`:
  - import `getOrgBrandingClient` from `_shared/orgBranding.ts`; cache branding per `organisation_id` alongside the existing API-key cache so a batch spanning orgs does one read each.
  - build the message from `{ name, phone }`; omit the call-us clause when `phone` is blank.
  - replace `ok = resp.ok` with a parsed-JSON `result.success === true` check (non-JSON body → failure), same as `send-renewal-reminder`.
  - key resolution: `config.api_key_secret` → `Deno.env.get(...)`, falling back to `config.api_key`; skip the quote when neither resolves.
- Reuse the existing phone normalisation and `log-message` call unchanged.
- No schema, RLS, or cron changes. No front-end changes.
- Deploy both functions and verify with a dry lookup that branding resolves per org; no live sends triggered as part of the change.
