# BJ-0044b — Honest send outcomes in the New Job wizard

Today the Step 4 success screen always shows "Booking confirmation sent via WhatsApp ✔" whenever the toggle was on, even if nothing was sent. This makes both sends report their real outcome and surfaces it in the UI.

## 1. send-booking-confirmation (backend)

- Add the shared opt-out check (`_shared/optOut.ts`, `fetchOptOutDecision` / `evaluateOptOut`) before sending, matching the other customer-facing automated sends.
- Return a structured payload instead of bare `success`:
  - sent: `{ success: true, sent: true }`
  - skipped: `{ success: true, sent: false, skipped: true, reason: "no_phone" | "opted_out" | "no_integration" | "no_api_key" | "customer_not_found", message: "<human readable>" }`
  - failed: `{ success: false, sent: false, reason: "whatsapp_send_failed", message: "<provider detail>" }`
- Keep HTTP 200 for skips (so `functions.invoke` returns data, not an error); keep the existing `message_log` / `edge_function_logs` writes. An opted-out customer logs a skip, no provider call.
- No change to `verify_jwt` or call signature.

## 2. NewJobPanel.tsx

- Capture both `data` and `error` from the `send-booking-confirmation` invoke (currently only `error`), and keep capturing both for `send-deposit-link`.
- Normalise each into a small result object: `{ status: "sent" | "skipped" | "failed", reason?: string }`, derived from `fnError` (→ failed), `fnData.success === false` (→ failed with returned reason), `fnData.skipped` (→ skipped with reason), else sent.
- Store both results in state and pass them to `SuccessScreen`. Wrapped in try/catch as today — job creation never fails or rolls back on a send outcome.

## 3. Success screen

- Booking confirmation line: tick only when status is `sent`. When skipped or failed, render a muted warning line (amber, `AlertTriangle`) with the specific reason text returned by the function, e.g. "Booking confirmation not sent — customer opted out of messages".
- Add the same treatment for the deposit link when that toggle ran.
- Hide the WhatsApp preview block when the confirmation was not actually sent.

## 4. Toasts

- One non-blocking warning toast per failed/skipped send (default/warning variant for skips, destructive for failures), replacing the current generic deposit-link copy with the reason from the function.
- The "Job created ✔" toast still fires regardless.

## Verification (test tenant, cleaned up after)

1. Customer with phone + working credentials → two ticks, no warning toast.
2. Customer with phone cleared → job saves, success screen shows "no phone number" skip, no tick.
3. Customer with `opted_out = true` → "skipped — opted out".
4. Cavan Gas with a deliberately broken WhatsApp key → failure state with provider reason, no false success.

All test jobs, customers, message_log and notification rows created during verification are deleted afterwards.

## Note on ExtraWorkSheet.tsx

`src/components/engineer/ExtraWorkSheet.tsx` has the same `fnData.success` gap. Not touched in this task; I will confirm in the report whether this exact pattern should be applied there as a follow-up.

## Tests

Deno unit tests for the new skip/failure classification in the booking-confirmation function, plus a small pure helper for the frontend result normalisation with vitest coverage of the four outcomes.
