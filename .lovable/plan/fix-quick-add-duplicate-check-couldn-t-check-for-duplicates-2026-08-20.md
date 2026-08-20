# Fix quick-add duplicate check — "Couldn't check for duplicates"

## The defect

`StepCustomer.handleNext` in `src/components/jobs/NewJobPanel.tsx` (lines 237-256) runs the duplicate check with `.maybeSingle()`. That call **errors** when more than one row matches, and live data has many phones duplicated inside a single organisation — 15 customer rows share `+353892109224` in K&N, 7 share `+353872354257` in Dublin Gas, plus six more phones with 2-5 rows each.

So instead of reporting a duplicate, the query fails, the fail-safe fires, and the user is permanently blocked with "Couldn't check for duplicates — try again". Retrying can never succeed. The check is also exact-string equality on the formatted `+353…` number, so it misses the same line entered as `0894…`.

## What changes

Only the duplicate-check block and its surrounding state in `StepCustomer`. No change to customer creation, the search step, `handleSubmit`, or any other file.

1. **Replace `.maybeSingle()` with a list query.** Fetch `id, name, phone` for the org (no `.eq("phone", …)`), then match in JS on the last 9 digits so `0894436301` and `+353894436301` are recognised as the same line. This reuses the BJ-0046 matching rule already proven in `_shared/phone.ts`; a small local `last9` helper is added to `src/lib/customerValidation.ts` (frontend cannot import Edge Function files) with unit tests, rather than duplicating the regex inline.
2. **Show all matches, not just one.** `duplicate` becomes a list. The warning names each matching customer so the office user can see whether it is a genuine duplicate or a second person at the same household number.
3. **Allow an explicit override.** Because legitimate same-phone households exist in this data, the warning no longer hard-blocks. It shows the matches plus a "Create anyway" confirmation; only after that is pressed does `onNext` fire. `canProceed` drops `!duplicate` and keeps `!checkingDupe`.
4. **Keep the genuine fail-safe.** A real query error (network, RLS, 400) still blocks with the existing message — that path stays, it was only firing for the wrong reason.
5. **Guard `orgId`.** `orgId!` is currently non-null-asserted; if the org has not resolved the filter becomes `organisation_id=eq.undefined` and 400s into the same generic message. The check waits for a resolved `orgId` and reports "Still loading your organisation — try again in a moment" instead.

## Existing duplicate rows

Left in place. As part of this work you get a read-only list of the duplicate groups (org, phone, customer names) to review; no merging or deletion happens here. A merge tool, if wanted, is separate work.

## Verification

- Unit tests in `src/lib/quickAddCustomer.test.ts`: last-9 matching across `0894…` / `+353894…` / spaced forms; multi-match returns every row rather than erroring; a query error still blocks; override clears the block.
- Preview click-through as K&N: enter `0894436301` in quick-add — expect the named matches listed (not the error), confirm "Create anyway" advances to Step 2, and confirm a genuinely unused number advances with no warning at all.
- Console clean, mobile layout of the warning block checked.

Risk: Medium — this sits on the booking creation path, so it ships with unit tests plus a live click-through rather than as a bare UI tweak.
