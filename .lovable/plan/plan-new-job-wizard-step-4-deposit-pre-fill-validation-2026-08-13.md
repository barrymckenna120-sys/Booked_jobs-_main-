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

## When is `deposit_percentage` fetched? (answered before build)

Today `StepPayment` already fetches the tenant settings row on **Step 4 mount** (a `useQuery` for `default_service_price`, `default_emergency_price`, etc.). It is not fetched at wizard entry and not fetched on the Payment Status toggle.

Decision for this build: **add `deposit_percentage` to that existing Step 4 mount query** (re-scoped to `organisation_id`), so the value is resolved as soon as Step 4 opens — before the user can realistically toggle Payment Status. No new fetch is triggered by the toggle itself.

Handling the not-yet-resolved window:

- The pre-fill effect only runs when the settings query has resolved (`settingsLoaded === true`). It does not run against `undefined`, so there is no risk of calculating with not-yet-loaded data or writing `NaN` into the field.
- If the user switches to "Deposit Taken" before the query resolves, the Deposit Amount field stays empty and the pre-fill applies once the data lands — the same pattern the existing Job Amount pre-fill uses (`priceInitialized` guard).
- Double-fire risk is closed by keying the pre-fill on `depositManuallySet`: once the user types in the field, the flag flips to `true` and the late-arriving settings value will not overwrite their entry.
- Submit is not blocked on the fetch. If the user somehow submits before it resolves, the deposit is whatever is in the field (empty → 0), which is the current behaviour; the "deposit cannot exceed job amount" guard still applies.

## What NOT to touch
- `default_deposit` anywhere.
- `QuoteForm.tsx`.
- Settings UI tabs or the `settings.deposit_percentage` column/schema.

## Verification
1. **K&N pre-fill matches percentage.** K&N test job, Job Amount €800, switch Payment Status to "Deposit Taken" → confirm K&N's actual `deposit_percentage` from the settings table and that the pre-filled Deposit Amount is exactly that percentage of €800.
2. **Manual edit is not overwritten.** Type over the pre-filled Deposit Amount, then change Job Amount → confirm the typed value is not overwritten.
3. **Validation blocks submit.** Enter a Deposit Amount greater than Job Amount and press Create Job → confirm submission is blocked and the inline error shows on the field, with no value clamping.
4. **Toggle away and back resets the flag.** Switch Payment Status from "Deposit Taken" to "Invoice After" and back to "Deposit Taken" → confirm Deposit Amount recalculates fresh from the percentage and does not retain the stale manually-typed value from before the switch.
5. **Null `deposit_percentage` falls back to 50%.** Current state, confirmed by query: **all four tenants (K&N Gas Services, Dublin Gas, Cavan Gas, Webliveview Ltd) have `deposit_percentage = 50` — none is null.** So the null path cannot be exercised end-to-end against existing data without changing a tenant's setting, which is out of scope here. This is recorded as a **gap**: the fallback will be covered by a unit test on the calculation helper (null/undefined → 50) rather than a live tenant, and a manual null test case should be run separately if you want live confirmation.
