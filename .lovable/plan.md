# Fix Engineer Payment Confirmation Payload (KN-520 regression)

## What this does
Stops the engineer app's card/cash completion flow from overwriting `service_calls.revenue` with the payment amount. The card `onDone` callback currently passes `revenue: confirmedAmount`, which is written directly to the DB because `revenue` is not stripped by the sanitizer. The correct contract is `confirmedRevenue: confirmedAmount`, which `useEngineerJobs.updateJob` already consumes for `buildPaymentPatch`.

## Files touched
- `src/components/engineer/EngineerJobCard.tsx`
- `src/lib/serviceCallUpdate.ts`
- `src/hooks/useEngineerJobs.ts`

## Changes
1. **EngineerJobCard.tsx** — rename `revenue: confirmedAmount` to `confirmedRevenue: confirmedAmount` at both `PaymentSheet` `onDone` call sites (the completion flow and the standalone payment flow).
2. **serviceCallUpdate.ts** — add `"revenue"` to `SERVICE_CALL_UI_ONLY_KEYS` in `sanitizeServiceCallUpdatePayload` so no caller can accidentally set `service_calls.revenue` through this path.
3. **useEngineerJobs.ts** — before each `buildPaymentPatch()` invocation, guard `confirmedRevenue` so it cannot silently resolve to `0` or `undefined`. If it does, log the job ID and payload context and throw an explicit error instead of writing a no-op payment patch.

## Out of scope
- `src/pages/engineer/EngineerJobDetail.tsx` existing working path is left untouched.
- Office `TakePaymentModal.tsx` is left untouched (separate task).
- No database writes or migrations.

## Verification
- Run typecheck.
- Search for any remaining `revenue: confirmedAmount` patterns in the engineer app.
