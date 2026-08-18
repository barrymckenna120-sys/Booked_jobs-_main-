# Boiler Details + Customer Receipt Notes on Job Completion

Add two new blocks to the engineer's Complete Job screen: persistent boiler details for the customer, and a per-visit note that appears on the customer's receipt.

## What the engineer sees

The current single card that holds "Notes for office" and "Tag this job" is split, so the order becomes:

```text
Notes for office            (own bordered box, unchanged content)
Boiler Details              (new grouped box)
  Boiler Make               text
  Boiler Model              text
  Warranty Expiry Date      optional date, no default
Notes for Customer Receipt  (new box, blue-tinted label/border)
  helper: Visible to the customer on their receipt — keep it plain and customer-friendly.
Tag this job                (own bordered box, tags + tag-date picker unchanged)
```

- Boiler Make / Model / Warranty Expiry pre-fill from the customer record when values exist, otherwise blank.
- Customer Receipt notes always start blank on every job — never pre-filled, never carried over.
- Warranty Expiry uses a native date input (same pattern as the existing Tag date field) for reliable iOS behaviour, and stays optional.

## What gets saved

On completion:
- Boiler Make, Boiler Model and Warranty Expiry Date are written to the **customer record** (they persist across jobs). Blank fields are saved as empty/unset rather than overwriting with junk; the combined "boiler make & model" field is left alone as agreed.
- Customer Receipt notes are written to **this job only**, into the field the receipt already reads, so it shows in the receipt's Notes box (respecting the existing per-tenant receipt toggle).
- Internal office notes, job notes, warranty flag and warranty years are untouched. No other field, layout or behaviour on the screen changes.

## Technical notes

- `src/components/engineer/CompleteSheet.tsx`
  - New state: `boilerMake`, `boilerModel`, `warrantyExpiry` (seeded from `customer.boiler_brand`, `customer.boiler_model`, `customer.warranty_expiry_date`), and `customerNotes` (always `""`).
  - Split the existing wrapper `div` so "Notes for office" and the tag section each get their own `rounded-md border border-input` box; tag toggles, tag-date gate and the disabled-state logic on "Mark as Complete" stay exactly as they are.
  - Customer-notes box uses the existing receipt tint tokens (primary/blue-tinted border + label) so it reads as customer-facing; no hardcoded hex colours.
  - Pass the four new values through the existing `onDone(data, jobTagDate)` payload.
- `src/lib/serviceCallUpdate.ts`: add `boilerMake`, `boilerModel`, `warrantyExpiry`, `customerNotes` to the UI-only key list so they can never leak into a `service_calls` update.
- `src/pages/engineer/EngineerJobDetail.tsx` (`updateJob`)
  - Destructure the four new keys alongside `workDone`/`officeNote`.
  - Set `dbPatch.customer_facing_notes` from `customerNotes` on completion (trimmed; empty string → `null`).
  - After the successful `service_calls` update, run a separate `customers` update for `boiler_brand`, `boiler_model`, `warranty_expiry_date` — only including keys the engineer actually filled/changed, wrapped in try/catch so a customer-sync failure never blocks completion. The existing `boiler_make_model` sync block is left as-is.
  - Offline queue path unchanged.

## Verification

- Complete a K&N scratch job with pre-existing boiler data: fields pre-filled, edits land on the customer record, receipt note appears on that receipt only.
- Complete a scratch job for a customer with no boiler data: fields blank, saving with blanks leaves the customer record unharmed, warranty date left empty stays unset.
- Open a second job for the same customer: boiler fields pre-filled from the update, Customer Receipt notes blank again.
- Confirm office notes / job notes / tags / payment flow and the receipt PDF are unchanged, and no console errors on mobile viewport.
