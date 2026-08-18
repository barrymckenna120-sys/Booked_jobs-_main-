# Office-side job completion path audit

## Finding

Office job completion (used by Nicole and other office staff) does **not** use `CompleteSheet.tsx`. It runs on a separate screen:

- Engineer completion: `src/pages/engineer/EngineerJobDetail.tsx` → `src/components/engineer/CompleteSheet.tsx` (boiler make/model + customer receipt notes fields exist here).
- Office completion: `src/pages/JobDetail.tsx` (the admin/job detail page).

## Why mirroring is not possible in the office completion screen

`JobDetail.tsx` `handleMarkComplete` only writes:
- `status` → `"Completed"`
- `completed_at` → current ISO timestamp
- `notes` → internal/engineer notes

It has no UI inputs for boiler make, boiler model, warranty expiry, or customer receipt notes. Therefore there is no placeholder text to mirror on that screen.

## Where office boiler details are actually edited

The office edits boiler make/model in `src/pages/CustomerDetail.tsx`, which already uses boiler brand/model pickers and placeholder/helper text in the same style.

## Optional follow-up

Align the office `CustomerDetail.tsx` boiler guidance to match the new engineer wording exactly:
- Boiler make placeholder: `e.g. Ideal, Worcester Bosch, Vaillant`
- Boiler model placeholder: add `e.g. Logic Max Combi2 C30` if not already present.

This is a cosmetic, low-risk string-only change and would be the only sensible place to "mirror" the guidance.
