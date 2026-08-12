# Dublin Gas WhatsApp secret — restore fail-closed behaviour

The confirm-only audit passed on all four points, with one deviation: the secret `THREESIXTY_API_KEY_DUBLIN_GAS` now exists in the project secret store. It was meant to stay a deliberately non-existent placeholder so Dublin Gas WhatsApp sends fail closed.

## Recommendation

Leave it untouched for now. Deleting a secret is destructive and, if Barry deliberately added a real 360Messenger key for Dublin Gas, removing it would silently break their WhatsApp sends. Nothing else in the audit requires action.

## If you do want it reverted

1. Delete the secret `THREESIXTY_API_KEY_DUBLIN_GAS`.
2. Leave `tenant_integrations` untouched — Dublin Gas's `360messenger.api_key_secret` keeps pointing at the now-missing name, so the shared resolver in `supabase/functions/_shared/whatsappCredentials.ts` returns `secret_missing:THREESIXTY_API_KEY_DUBLIN_GAS` and every sender fails closed with a nameable reason instead of falling back to another tenant's key.
3. Verify by invoking one Dublin Gas send path and confirming the 400 `WhatsApp not configured` response.

No schema changes, no code changes, no other findings outstanding.
