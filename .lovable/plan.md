# Inbound WhatsApp messages missing from customer Message History

Investigation done first. This is **not** a UI filtering bug, and it is not a persistence bug either — both of those already work. There are two real blockers, one inside the project and one at 360Messenger.

## What the investigation found

Confirmed by reading code and querying the live database:

- **The Message History UI already includes inbound.** `WhatsAppHistory.tsx` reads `whatsapp_messages` and `message_log` for the customer with no direction filter, merges and sorts both by timestamp. Nothing excludes inbound rows.
- **Inbound rows already exist and are correctly linked.** `message_log` holds 230 inbound rows and `whatsapp_messages` 18 — every inbound `message_log` row has a non-null `customer_id`, so any inbound record that lands does render in the profile. The most recent genuine customer reply is **26 Aug 2026**; nothing since.
- **`whatsapp-inbound` persists correctly.** It matches the sender by last-9-digits across `phone`/`landline_phone`, resolves the organisation, dedupes replays, and writes both a `whatsapp_messages` row (`direction: inbound`, `sent_by: customer`, provider timestamp) and a mirrored `message_log` row.
- **Blocker 1 — the webhook secret is not configured.** The function fails closed when `WHATSAPP_INBOUND_SECRET` is missing, and that secret does **not** exist in this project's secret store. A live probe of the deployed endpoint returned `401 {"error":"Unauthorized"}`. So even if 360Messenger did call the callback URL, every request would be rejected before the payload is read.
- **Blocker 2 — 360Messenger will not accept the callback URL** (403 on registration, dashboard save fails, ticket unresolved). Provider-side; not fixable from this codebase.
- **No `whatsapp-inbound` invocation logs exist at all**, consistent with the provider never having delivered a single callback.

## Plan

### Step 1 — Configure the inbound webhook secret
Add `WHATSAPP_INBOUND_SECRET` to the project secrets (a random value; it must be readable so it can be pasted into the 360Messenger callback URL as `?s=<secret>`, so it is entered via the secure form rather than machine-generated). Nothing in the function code changes — it already reads this variable and already fails closed without it.

### Step 2 — Prove the endpoint end-to-end without the provider
Using a scratch/test phone number only (never a real customer), POST a realistic 360Messenger payload (`dataType: "message"`, `From`, `Chat`, `createdAt`) to the deployed function with the correct `?s=` value, then verify:
- HTTP 200 with `{"status":"ok"}`
- one new inbound `whatsapp_messages` row and one new `message_log` row, correct `customer_id`, `organisation_id`, direction, body, sender and provider timestamp
- the message appears in that customer's Message History in chronological order, with existing outbound messages unaffected
- a wrong/absent `?s=` value still returns 401
- a repeat delivery of the same payload is ignored by the dedupe guard

This proves everything from the callback URL inwards, which is the only part inside our control.

### Step 3 — Unblock 360Messenger delivery (your side)
Once Step 1 is done I will give you the exact callback URL, including the secret query parameter, to paste into the 360Messenger dashboard / registration API. If it still returns 403, the remaining failure is entirely provider-side and the support ticket is the path — the two candidate causes worth putting to them are that the callback URL must be registered on the account's own API key/instance, and that some plans reject callback URLs containing query strings. If it turns out to be the query-string case, the fallback is to move the secret into the URL path segment instead; that is a small change to the same function and I will only make it if the provider confirms it.

### Step 4 — Confirm with a real message
After the provider accepts the URL, send a real WhatsApp reply from a scratch number and confirm it appears in Message History with the correct direction, content, sender and timestamp.

## Out of scope

No change to the Message History UI, the sender-matching logic, the dedupe guard, outbound senders, or any other Edge Function. No change to how outbound messages display.

## Honest limitation

Steps 3 and 4 depend on 360Messenger accepting the callback URL. Steps 1 and 2 make our side provably correct and ready, but I cannot make the provider deliver webhooks while registration returns 403.
