# Add standalone "Request Part" flow to Engineer Parts page

## Goal
Let engineers log a job-less parts request directly from `/engineer/parts` by reusing the existing `PartsNeededSheet` and the same `insertPartsRequest` path used on job cards.

## Changes

### 1. `src/pages/engineer/EngineerParts.tsx`
- **Header row:** turn the bare `"My Parts"` div into a flex row with the title on the left and a `"+ Request Part"` button on the right.
  - Use the existing `Button` from `@/components/ui/button` and a `Plus` icon from `lucide-react`.
  - Match the primary-action visual weight already used in the engineer app (e.g., `h-12`, `font-extrabold`, full class pattern from `EngineerJobCard.tsx`).
- **State:** add `showRequestSheet` and `savingPart` booleans.
- **Engineer lookup:** extend the existing `engineers` query from `select("id")` to `select("id, name, organisation_id")` so the same row resolves `organisation_id` and the engineer's display name.
- **Sheet:** render the existing `PartsNeededSheet` controlled by `showRequestSheet`.
- **On confirm:** call `insertPartsRequest` exactly as `EngineerJobCard.tsx:303-311` does, but with:
  - `serviceCallId: null`
  - `customerId: null`
  - `loggedBy: user.id`
  - `loggedByName: engineerRow?.name ?? user?.email ?? null`
  - `assignedTo: null`
  - `organisationId: engineerRow.organisation_id`
- **After success:** close the sheet, call `setReloadKey(k => k + 1)`, and show a success toast.
- **On error:** mirror `EngineerJobCard.tsx`'s error toast: `{ title: "Couldn't save part", description: error.message, variant: "destructive" }`.

### 2. No changes elsewhere
- `PartsNeededSheet.tsx` stays untouched.
- No schema or RLS changes; the existing insert policy already permits `organisation_id`-only inserts.

## Verification
- Manual click-through: open `/engineer/parts`, tap "+ Request Part", submit a test part, confirm the new row appears without a page refresh.
- Check console for no errors.
- Confirm mobile layout is not broken.
