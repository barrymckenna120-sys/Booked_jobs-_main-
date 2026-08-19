# Declined Payments view (office/admin only)

## Two blockers found before any UI can work

1. **The table is unreadable from the app today.** `payment_checkout_attempts` has exactly one policy — `ALL` for `service_role` — and no policy or grant for `authenticated`. A frontend query returns zero rows / permission error no matter how it's written. To ship this view I need one small DB change: a `SELECT` policy for org members plus `GRANT SELECT ... TO authenticated`. That's a policy/grant addition only — no column, index, trigger or webhook code touched. If you'd rather not add it, the alternative is a read-only Edge Function using the service role, which is more code and still a backend change.
2. **There is no declined data yet.** All 15 rows in the table are `status = 'PENDING'`. The status write-back that produces `FAILED / EXPIRED / CANCELLED` was applied but not deployed, so the list will be legitimately empty until that ships and a real decline occurs. The view will be built with a proper empty state.

## Amount column — which source

`payment_checkout_attempts` has no `amount` column (columns: id, service_call_id, organisation_id, checkout_id, checkout_reference, status, created_at, updated_at). So amount must come from the job. Recommendation: show `service_calls.deposit_amount` when `deposit_required` is true, otherwise `balance_due`, labelled "Amount due". This is the amount still owed now, which is what an office user chasing a decline needs. It is not a guaranteed reproduction of the exact declined checkout amount — that isn't recoverable from stored data.

## Where it goes

New sub-tab **"Declined"** inside the existing Finance page (`/finance`, `src/pages/FinancePage.tsx`), sitting after Overview and Sales. Finance is already office-gated and is where payment chasing lives, so no new route or nav entry is needed.

## Query

```
supabase.from("payment_checkout_attempts")
  .select(`id, checkout_id, status, updated_at,
           service_calls!inner(id, job_reference, balance_due, deposit_amount, deposit_required,
             customers!inner(id, name, phone))`)
  .in("status", ["FAILED", "EXPIRED", "CANCELLED", "CANCELED"])
  .order("updated_at", { ascending: false })
```

Org scoping comes from the new RLS policy (`organisation_id = get_my_org_id()`), same as every other tenant table — no client-side org filter, matching the QuotesList pattern.

## Component structure

- `src/pages/DeclinedPayments.tsx` — modelled on `src/pages/QuotesList.tsx`: `useAuth` + `useUserRole` (`canAccessOffice` guard) + `useOrgId().ready` gate, `useQuery`, search box, card-wrapped table, loading spinner, empty state.
- Columns: Customer, Job Ref (links to `/jobs/:id`), Amount due, Status badge, Failed at (`updated_at`, `dd MMM HH:mm` via date-fns), Contact.
- Status badges reuse the destructive/warning token classes already in `QuotesList`'s `STATUS_BADGE` (no hardcoded colours).
- Contact actions copy the `Jobs.tsx` pattern exactly: `tel:` link plus `https://wa.me/<formatted>`. The inline `formatWhatsApp` helper in `Jobs.tsx` will be lifted to `src/lib/whatsappLink.ts` and imported by both, so there's one implementation.
- `FinancePage.tsx`: add the third tab entry and render the new page.

## Scope

Frontend read-only plus the one RLS policy + grant migration described above. No changes to `payment_checkout_attempts` columns, `sumup-payment-webhook`, or any `_shared/` payment code.
