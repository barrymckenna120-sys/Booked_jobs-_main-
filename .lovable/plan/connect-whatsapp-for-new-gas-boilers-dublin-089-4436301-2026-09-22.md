# Connect WhatsApp for New Gas Boilers Dublin (089 4436301)

Goal: WhatsApp quotes and messages can be sent from New Gas Boilers Dublin's own number, and never from another company's account.

## Current state

The company's messaging record already holds the right phone number (089 4436301) and country code (353), but no account key. That is why sending a quote by WhatsApp refuses with "WhatsApp integration not configured" — the safety check is working.

## Steps

1. **Collect the key.** I open the secure form for you to paste the 360Messenger account key for 089 4436301. The value goes straight into the encrypted store; it never appears in chat, logs or code.
2. **Point the company at that key.** One small data change: record the key's name against New Gas Boilers Dublin's messaging record only. No other company is touched, and no code changes.
3. **Verify live.** Send one test WhatsApp to a scratch test number (never a real customer), then read back the send record to confirm it went out from 089 4436301, and confirm the enquiry quote screen no longer refuses.
4. **Report** with the read-back evidence and the send result.

## Not in scope

- No change to any other company's messaging setup.
- No change to the code that sends messages, to the enquiry pages, or to any security rule.
- Receiving replies stays as it is today; that's a separate item.

## Technical detail

- New secret name: `THREESIXTY_API_KEY_NEWGASBOILERS` (matches the existing per-tenant pattern, e.g. `THREESIXTY_API_KEY_DUBLIN_GAS`). Created via the secure secret form, never `set_secret` with a value from chat.
- Data change: set `config.api_key_secret = 'THREESIXTY_API_KEY_NEWGASBOILERS'` on the `tenant_integrations` row where `integration_type = '360messenger'` and `organisation_id = 59bb0688-09bf-451c-aa0e-c920521069fe`, preserving the rest of the config object. Isolated, idempotent, review-gated write.
- Resolution path is already tolerant: `_shared/whatsappCredentials.ts` `resolveWhatsappApiKey` prefers the `360messenger` row and the `api_key_secret` name form, so no sender code needs editing.
- Note: `getWhatsAppConfig` (used by 6 functions) also expects `phone_number_id` / `waba_id`; those stay empty as for Cavan. If a send path that uses that resolver fails in step 3, I report it rather than widening this change.
