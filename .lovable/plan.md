## DU-011 WhatsApp Send — Audit Results

### 1. Job / Org confirmation ✅
- `service_calls.id` = `b07e2832-cbd1-4222-bded-bf42ce01ce1c`
- `job_reference` = `DU-011`
- `organisation_id` = `f1950683-e8b9-41cf-8972-2aa59516850d` → **matches Dublin Gas**
- `payment_method` = `card`, `completed_at` = null, `receipt_sent` = false

### 2. `message_log` row (exists — good) ⚠️ but wrong failure reason
```
id:            1c80dbe3-6bcb-40cc-8c93-fda22dbf868c
created_at:    2026-07-14 17:23:57 UTC
channel:       whatsapp
message_type:  receipt
status:        failed
organisation_id: f1950683-e8b9-41cf-8972-2aa59516850d (Dublin Gas)
customer_id:   556a48cf-… (Paul Blue)
related_id:    b07e2832-… (DU-011)
error_message: Unrecognised phone format: "+892109224"
```

### 3. Edge function log (send-whatsapp-receipt, same window)
```
level: error
msg:   send-whatsapp-receipt: pre-send failure: Unrecognised phone format: "+892109224"
timestamp: 2026-07-14 17:23:57 UTC
```
No HTTP 500 / no crash — function returned `200 { success:false, whatsapp_sent:false, reason:"Unrecognised phone format…" }` via the pre-send failure branch, then logged to `message_log`.

### 4. Root cause of the failure
- Customer `Paul Blue` (id `556a48cf-…`) has `phone = "+892109224"` — **9 digits, invalid country code `+89`**. Almost certainly a mistyped `+353 892109224` (Irish mobile) with a missing `353`.
- `normalisePhone()` in `_shared/whatsapp.ts` correctly rejected it before any 360Messenger call was made.
- The tenant secret path (`THREESIXTY_API_KEY_DUBLIN_GAS`) was **never reached** — the phone check runs first.

### Verdict
**Designed behavior on the wrong axis.** The "fail loudly" gate did fire (200 + `success:false`, `message_log` row with `status='failed'` and an `error_message`), so the plumbing from the recent fix is working end-to-end. However, this specific failure is a **bad customer phone number**, not a missing per-tenant secret. We have NOT actually proven that the Dublin Gas missing-secret path fails the way we intended.

### Recommended next steps (no changes yet — awaiting approval)
1. **Fix Paul Blue's phone** (`+892109224` → `+353892109224`) in `customers`, then re-trigger the receipt on DU-011. Expected result then: `message_log.error_message = 'Missing WhatsApp API key secret: THREESIXTY_API_KEY_DUBLIN_GAS'` (or the exact string thrown by `getWhatsAppConfig`).
2. Optional data hygiene: query `customers` for other rows where `phone` doesn't match `^\+353\d{9}$` (or the org's expected country pattern) to surface more mistyped numbers before they cause silent send failures.
3. Optional UX: surface the pre-send failure reason as a toast on `ServiceReceipt.tsx` auto-send (currently it swallows the `success:false` 200 because it only toasts on thrown errors) — right now the engineer sees nothing when the number is malformed.

Awaiting your call on whether to (a) just fix Paul's phone and re-test, (b) also add the phone-format audit query, and/or (c) also add the toast on `success:false`.