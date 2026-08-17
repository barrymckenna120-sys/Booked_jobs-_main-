# BJ-0049: Fix log-message field contract mismatch

## Goal
Update `supabase/functions/log-message/index.ts` so it accepts the field names actually sent by the three WhatsApp sender functions (`send-payment-received`, `send-invoice-whatsapp`, `send-schedule-confirmation`) while remaining fully backwards-compatible with callers that already use the canonical names (`content`, `channel`, `direction`, `related_id`).

## Current state
- `log-message/index.ts` reads only `body.content`, `body.channel`, `body.direction`, `body.related_id`, `body.related_type`.
- The three scoped sender functions (and `send-outstanding-invoice-reminders`, `quote-followup-day3`, `quote-followup-day6`) post a different payload: `service_call_id`, `recipient_phone`, `message_body`, `status`.
- Result: `status`, `recipient_phone`, and message body are lost on insert; rows appear with `status = null`, `content = null`, `recipient_phone = null`.

## Change
In `supabase/functions/log-message/index.ts`, after parsing `body`, build the insert payload using coalescing rules (new aliases take precedence over legacy names):

| Insert column | Source |
|---------------|--------|
| `status` | `body.status` if present, else leave null |
| `content` | `body.message_body` if present, else `body.content` |
| `related_id` | `body.service_call_id` if present, else `body.related_id` |
| `related_type` | `'service_call'` when `body.service_call_id` is present and non-empty; otherwise `body.related_type` |
| `recipient_phone` | `body.recipient_phone` if present, else null |
| `channel` | `body.channel` (unchanged) |
| `direction` | `body.direction` (unchanged) |
| `message_type` | `body.message_type` (unchanged) |
| `sent_by` | `body.sent_by` (unchanged) |
| `sent_at` | `body.sent_at` (unchanged) |
| `customer_id` | existing resolution logic (unchanged) |
| `organisation_id` | existing resolution logic (unchanged) |

Specifically:
- Do **not** default `status` to `'pending'` when `body.status` is absent; leave it null.
- Treat empty string `""` the same as null/missing for `service_call_id`, `related_id`, `related_type`, `recipient_phone`, `message_body`, `content`.

## Backwards compatibility
Callers that already send the canonical fields are unaffected because:
- `body.status` is absent → `status` remains null (same as today).
- `body.message_body` is absent → `content` falls back to `body.content` (same as today).
- `body.service_call_id` is absent → `related_id` falls back to `body.related_id` (same as today).
- `body.recipient_phone` is absent → `recipient_phone` remains null (same as today).

## Verification
1. Deploy the updated Edge Function.
2. Invoke `log-message` with a legacy payload (`content`, `channel`, `direction`, `related_id`) and confirm all columns are written as before.
3. Invoke `log-message` with a sender payload (`service_call_id`, `recipient_phone`, `message_body`, `status`) and confirm:
   - `content` = `message_body`
   - `status` = supplied value
   - `related_id` = `service_call_id`
   - `related_type` = `'service_call'`
   - `recipient_phone` = supplied value
4. Run a query on `message_log` to confirm recent rows from `send-payment-received`, `send-invoice-whatsapp`, and `send-schedule-confirmation` now have non-null `content`, `status`, and `recipient_phone`.

## Files changed
- `supabase/functions/log-message/index.ts` only.

## Risk
Low. Single-file, additive change; no callers modified; legacy payloads remain unchanged.
