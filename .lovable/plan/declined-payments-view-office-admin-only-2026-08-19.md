# Declined Payments view (office/admin only)

## Two blockers before any UI can work

1. **The table is unreadable from the app today.** `payment_checkout_attempts` has exactly one policy — `ALL` for `service_role` — and no policy or grant for `authenticated`. A frontend query returns a permission error no matter how it's written. Fix is one policy + grant (no columns, indexes, triggers or webhook code touched), role-gated so engineers cannot read it even inside their own org:

```sql
GRANT SELECT ON public.payment_checkout_attempts TO authenticated;

CREATE POLICY "Admin/office can read payment_checkout_attempts"
ON public.payment_checkout_attempts
FOR SELECT
TO authenticated
USING (
  organisation_id = get_my_org_id()
  AND get_user_role(auth.uid()) = ANY (ARRAY['admin','office','owner','manager'])
);
```

This mirrors the live `debug_logs` / `boiler_brands` pattern (`organisation_id = get_my_org_id()` AND `get_user_role(auth.uid()) = ANY (...)`), widened to include `owner` and `manager` as `tenant_integrations` and `conversations` do — engineers are excluded. Existing service-role policy stays untouched. No INSERT/UPDATE/DELETE grants for `authenticated`, so the view is read-only by construction.

2. **Deployment status of Steps 2+3 — not live.** `sumup-payment-webhook/index.ts` (with `recordAttemptStatus` at line 70, called at 423 and 439), `_shared/sumupWebhook.ts` and `_shared/sumupCheckout.ts` are applied in the repo only. They have not been deployed to production; plan mode cannot deploy. Deploying those three is the first step once this plan is approved.

3. **There is no declined data yet.** All 15 rows in the table are `status = 'PENDING'` — `FAILED / EXPIRED / CANCELLED` only start appearing after the write-back above is deployed and a real decline occurs. The view ships with a proper empty state.

## Execution order once approved

1. Apply the policy + grant migration above, exactly as written.
2. Deploy `sumup-payment-webhook` to production (this carries `_shared/sumupWebhook.ts` and `_shared/sumupCheckout.ts`, which deploy as bundled shared modules, not as standalone functions). Confirm back with the deploy tool's live result, then re-check that no other deployed function bundles a stale copy of those shared files — any other SumUp function importing them gets redeployed too.
3. Only then build the frontend below, and show the diff before it goes live.




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
