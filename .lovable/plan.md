# Inbound WhatsApp messages not recorded (since 26/08/26)

## What is already confirmed (read-only)
- Last inbound message stored for Dublin Gas: 26/08/26 16:03. K&N has **zero** inbound rows ever. Cavan has none. Only the test company "K&N gas services Ltd" has recent inbound rows (last 26/09/26).
- The inbound handler rejects any call whose `?s=` value does not match one shared secret (fail-closed). This guard was changed on 26–27/08/26 — the same day Dublin Gas inbound stopped.
- The inbound handler has no retained logs, meaning no calls are currently reaching it (or logs have aged out).
- There is one shared inbound secret, not one per company; company is worked out from the sender/customer phone.

Root cause is **not yet confirmed**. Leading theory: 360messenger's configured webhook URL for Dublin Gas (and K&N) has no or an old `?s=` value, or points elsewhere, so calls are rejected or never sent.

## Step 1 — Diagnose (read-only, no changes)
1. Read the 26–27/08 changes to the handler to see exactly what altered authentication and company matching.
2. Check 360messenger for each live company's number: is inbound webhook supported on the plan, what URL is configured, and is it active (via their API using existing per-company keys; values never printed).
3. Send one test WhatsApp from a scratch number to Dublin Gas and watch the handler logs for arrival / 401 / error.
4. Report the confirmed cause before any code change.

## Step 2 — Fix (smallest change, likely 1–2 files)
- If the cause is the URL/secret mismatch: move to **per-company secrets** (`WHATSAPP_INBOUND_SECRET_<ORG>`), so the secret itself identifies the company, and re-register each company's webhook URL in 360messenger. Small change in the handler's auth check only.
- Company attribution: the matched secret fixes the company; customer lookup is restricted to that company only. If a phone matches several customers in that company, store the message against the company unlinked-to-customer and flag it, rather than guessing.
- Duplicate deliveries: skip if the provider message id is already stored.
- Keep CONFIRM / CANCEL / STOP logic untouched; only confirm it runs after recording.

## Step 3 — Rotate Dublin Gas secret
- Generate a new random secret (never shown), update Dublin Gas's webhook URL in 360messenger, then remove the old value. Confirm old secret gets 401, new gets 200.

## Step 4 — Verify
- Real replies from a scratch number: ordinary text, CONFIRM, CANCEL, STOP on a scratch job — each appears once, in order, on the right customer's Messages, after refresh.
- Replay same delivery twice → one row. Wrong/absent secret → 401. K&N-secret call cannot write to Dublin Gas.
- Typecheck, handler tests, build.

## Needs your approval at each gate
Diagnosis report → code diff → deploy of the inbound function only → secret rotation.

## Technical notes
- Files likely touched: `supabase/functions/whatsapp-inbound/index.ts`, possibly `_shared/cancelIntent.ts` (company resolution). No database structure changes expected.
