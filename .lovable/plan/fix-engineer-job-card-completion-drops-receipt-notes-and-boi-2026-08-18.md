# Fix: engineer job-card completion drops receipt notes and boiler details

When an engineer completes a job from the **job card** (the path used on Today/Upcoming lists), the Complete Job sheet shows and collects Boiler make, Boiler model, Warranty expiry and "Notes for customer receipt" — but those four values are silently discarded before the save. Completing the same job from the **Job Detail** page saves them correctly.

Result today: the customer receipt Notes box is empty and boiler details never update, for every completion done from the card.

## What changes for the engineer

Nothing visible on the sheet — same fields, same layout. The difference is that what they type is now actually saved, from both completion paths:

- Notes for customer receipt is written to that job and shows on the customer's receipt (screen and PDF), subject to the existing per-tenant receipt toggle.
- Boiler make / model / warranty expiry update the customer record, only when the engineer actually changed them. Clearing a pre-filled value counts as a change and is saved as empty.
- If the completion happens with no connection, all four values queue and sync with the rest of the update.

## Technical detail

Single file: `src/hooks/useEngineerJobs.ts` (`updateJob`). Mirror the already-proven logic from `src/pages/engineer/EngineerJobDetail.tsx:207-243` and `:347-356`:

1. Destructure `boilerMake`, `boilerModel`, `warrantyExpiry`, `customerNotes` out of `patch` so they no longer land in `...rest` (where `sanitizeServiceCallUpdatePayload` deletes them).
2. Build `customerBoilerUpdate` by diffing each boiler field against the seeded customer values. Source the customer from the hook's existing `customers` record map via the job's `customer_id` (`customers[theJob.customer_id]`), matching how the detail page uses its `customer` object; skip keys that are `undefined` or unchanged; trim, empty string -> `null`.
3. Set `dbPatch.customer_facing_notes` from `customerNotes` when it is defined (trimmed, empty -> `null`), before the `sanitizeServiceCallUpdatePayload` call.
4. On the success branch, apply `customerBoilerUpdate` to `customers` in its own try/catch so a customer-sync failure never blocks or fails the completion.
5. On the error/offline branch, push the same `customers` update to `addToQueue` alongside the existing `service_calls` retry entry.

Not changed: `sanitizeServiceCallUpdatePayload` keeps stripping all four keys (correct — they are UI-only for `service_calls`), the existing `boiler_make_model` sync block, tags, receipt/invoice numbering, payment handling, notes composition, and `EngineerJobDetail`.

### Staleness of the diff baseline

The hook's `customers` map is merge-only and refreshed inside `fetchAll` (mount, `service_calls` realtime, notification trigger, tab becoming visible, coming back online) — not on card or sheet open. So the baseline can be minutes or hours old. This is acceptable because `CompleteSheet` seeds its inputs from the same record used as the diff baseline: untouched fields diff as unchanged and are omitted, so a stale baseline cannot cause a phantom overwrite. Fields the engineer actively edits are last-write-wins against a concurrent office edit — the same behaviour as the existing Job Detail path. No locking or refetch-on-open is added.

### Rendering safety of the receipt note

`customer_facing_notes` goes from near-zero data to live customer-facing text, so it is worth stating: `PublicReceipt.tsx:222` renders it as a JSX text child (React-escaped) inside a `whitespace-pre-line` paragraph, and the PDF path draws it via jsPDF text calls. The only `dangerouslySetInnerHTML` in the codebase is unrelated (`src/components/ui/chart.tsx`). No change needed; no HTML injection surface.


## Tests

- Unit test for the boiler-diff helper logic: unchanged value -> omitted; edited value -> included trimmed; cleared pre-filled value -> `null`; `undefined` -> omitted.
- Regression test asserting a completion patch from the card path produces `customer_facing_notes` on the `service_calls` payload (the bug being fixed).

## Verification

- Complete a K&N scratch job **from the job card**: confirm `service_calls.customer_facing_notes` and the changed `customers` boiler fields in the database, and that the Notes box renders on the receipt screen and in a freshly generated PDF.
- Repeat on a Dublin Gas scratch job to confirm tenant-agnostic behaviour.
- Complete a card job leaving all four fields blank: confirm no customer boiler fields are overwritten and `customer_facing_notes` stays null.
- Clear a pre-filled warranty date from the card path: confirm it is unset on the customer record.
- Confirm the Job Detail completion path, tags, payment flow and revenue are unchanged, and no console errors on a mobile viewport.

Note: this touches job completion and persistence, so it is outside the lite-review lane — full process (tests plus scratch-job verification above) applies.
