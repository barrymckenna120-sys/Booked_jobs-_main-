# Plan: New Job wizard Step 4 deposit pre-fill + validation

## What to build
Update only `src/components/jobs/NewJobPanel.tsx` Step 4 (`StepPayment`) to:

1. Pre-fill Deposit Amount when Payment Status switches to "Deposit Taken":
   - Read `deposit_percentage` from the current tenant’s `settings` row (`organisation_id`-scoped).
   - Fallback to `50` if null/missing.
   - Use cent-safe rounding: `Math.round(((total * pct) / 100) * 100) / 100`.

2. Track a `depositManuallySet` boolean:
   - Set to `true` when the user edits the Deposit Amount field.
   - While `true`, never auto-recalculate Deposit Amount even if Job Amount changes.
   - Reset to `false` only when Payment Status is switched away from "Deposit Taken" and then back to it.

3. Add inline validation:
   - On submit, if Deposit Amount > Job Amount, block submission and show "Deposit cannot exceed job amount" under the Deposit Amount field.
   - Do not silently clamp the value.

4. Pass `orgId` from the main `NewJobPanel` into `StepPayment` so the settings lookup is organisation-scoped.

## What NOT to touch
- `default_deposit` anywhere.
- `QuoteForm.tsx`.
- Settings UI tabs or the `settings.deposit_percentage` column/schema.

## Verification
- K&N test job with Job Amount €800 and `deposit_percentage` = 50 → pre-filled Deposit Amount €400.00.
- Manually overwrite Deposit Amount, then change Job Amount → value stays unchanged.
- Submit with Deposit Amount > Job Amount → inline error shown and no submission.
