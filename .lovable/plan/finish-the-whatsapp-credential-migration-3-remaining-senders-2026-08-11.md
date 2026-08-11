# Finish the WhatsApp credential migration (3 remaining senders)

The shared resolver `_shared/whatsappCredentials.ts` fixed the "WhatsApp integration not configured" class of failure, but three senders were never migrated and still read a literal key only. They will fail for every tenant that stores its key as a secret name.

## What is actually broken

Verified by reading the functions and querying live integration rows:

| Function | How it reads the key today |
| --- | --- |
| `send-payment-received` | `config.api_key` on the `360messenger` row, else the global `THREESIXTY_API_KEY` env |
| `send-area-bulk-whatsapp` | `config.api_key` on the `360messenger` row, else nothing (skips the customer) |
| `send-outstanding-invoice-reminders` | `config.api_key` on the `360messenger` row, else nothing |

Live `tenant_integrations` state:

- `360messenger` rows for K&N Gas Services, Dublin Gas, Cavan Gas and Webliveview all carry `api_key_secret` and **no** literal `api_key`.
- Only Dublin Gas and K&N have a separate `whatsapp` row holding a literal key — and all three functions filter to `integration_type = '360messenger'`, so they never see it.

Net effect: bulk area sends and outstanding-invoice reminders cannot send for any tenant. `send-payment-received` only works where the global `THREESIXTY_API_KEY` env happens to be the right account's key, which silently sends on the wrong account for other tenants.

## The fix

Move all three onto the existing shared resolver — no new resolution logic, no schema changes.

1. `send-payment-received` — replace the `config.api_key || THREESIXTY_API_KEY` line with `fetchWhatsappApiKeyWithClient(client, orgId)`; drop the global env fallback so a misconfigured tenant fails loudly instead of sending from another account.
2. `send-outstanding-invoice-reminders` — replace `cfg.api_key` with `fetchWhatsappApiKeyWithClient`; return the resolver's `detail` in the error response.
3. `send-area-bulk-whatsapp` — this one caches a key per org inside the customer loop. Keep the cache, but populate it with `fetchWhatsappApiKey(supabaseUrl, serviceKey, orgId)` and log `resolution` in the existing skip warning so a skip names its cause.

## Tests

Extend `_shared/whatsappCredentials.test.ts` with the shapes this bug produced:

- `360messenger` row with `api_key_secret` only, secret present -> key resolved from env
- `360messenger` row with `api_key_secret` only, secret absent -> `secret_missing:<name>`, null key
- `360messenger` (secret name) plus `whatsapp` (literal) rows -> secret wins, literal is the fallback

## Out of scope

- No change to `tenant_integrations` rows, secrets, or schema.
- No change to message copy, templates, or any frontend file.
- The other senders already resolve keys correctly (via the shared helper or their own working secret-name fallback) and are left alone.

## Verification

- `deno test` on the shared credential tests.
- Live check: invoke `send-outstanding-invoice-reminders` in dry-run/log-only form for K&N and confirm the log shows `secret:THREESIXTY_API_KEY` rather than a not-configured error. No customer message is sent as part of verification without your go-ahead.
