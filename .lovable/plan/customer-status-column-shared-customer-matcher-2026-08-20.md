# Customer-status column + shared customer matcher

Two small, isolated pieces. Nothing is wired into any function or UI in this step.

## 1. `source` column — no migration needed

Confirmed from the database: `service_calls.source` is a plain `text` column with default `'Manual'::text`, and `service_calls` has **no CHECK constraints at all**. Current distinct values in use: `Tally Form`, `Renewal`, `Quote`, `Manual`.

So `'Tally Rebook'` can be written straight away — no enum, no constraint change, no migration. (Note: `tally-boiler-rebook` today writes `Tally Rebooking` / `Renewal Tally Rebooking`; adopting `Tally Rebook` later is a code change, not a schema one, and is out of scope here.)

## 2. Migration — one new column

Adds `customer_status_at_booking` to `service_calls`: nullable text, no default, constrained to `'new'`, `'existing'`, or NULL. No backfill; existing rows stay NULL.

```sql
ALTER TABLE public.service_calls
  ADD COLUMN customer_status_at_booking text;

ALTER TABLE public.service_calls
  ADD CONSTRAINT service_calls_customer_status_at_booking_check
  CHECK (customer_status_at_booking IS NULL
         OR customer_status_at_booking IN ('new', 'existing'));
```

## 3. New helper — `supabase/functions/_shared/matchCustomer.ts`

Reuses the exact normalisation already in `tally-incoming-job/index.ts` (lines 157-164):

```ts
mobileNumber.startsWith("+") ? mobileNumber
: mobileNumber.startsWith("353") ? "+" + mobileNumber
: "+353" + mobileNumber.replace(/^0/, "")
```

This is byte-identical in behaviour to `normalisePhoneE164` in `_shared/phone.ts` apart from that helper additionally stripping spaces/dashes/parens first, so the helper will call `normalisePhoneE164` and `last9Digits` from `_shared/phone.ts` rather than duplicating the logic.

Exported signature:

```ts
matchCustomer(supabase, organisationId, phone, email?)
  : Promise<{ matched: boolean; customerId: string | null }>
```

Lookup order, all scoped to `organisation_id`:

1. Exact match on the normalised `+353…` phone.
2. Fall back to last-9-digit match (the `tally-boiler-rebook` strategy: fetch org customers' `id, phone, updated_at`, compare `last9Digits`).
3. If a non-empty `email` was supplied and no phone match, case-insensitive `email` match (`ilike` or `lower()` on both sides).
4. Otherwise `{ matched: false, customerId: null }`.

Tie-breaking: when more than one row could match, pick the most recently active customer. `customers.updated_at` is reliably maintained by `update_customers_updated_at`, so order by `updated_at desc` (then by `created_at desc` or `id asc` as a stable secondary key).

## Not doing in this step

No changes to `tally-incoming-job`, `tally-boiler-rebook`, `NewJobPanel.tsx`, or any frontend component. No wiring, no backfill, no writes to the new column.
