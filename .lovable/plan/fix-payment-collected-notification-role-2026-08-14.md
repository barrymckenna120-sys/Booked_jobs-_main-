# Fix `payment_collected` notification role

## What
In `supabase/functions/sumup-payment-webhook/index.ts`, the `notifyOffice` insert creates `payment_collected` notifications without a `role` value. Because the row lacks `role = 'office'`, these alerts currently surface under the Engineer tab instead of the Office tab.

## Scope
- Only the `notifyOffice` insert in `sumup-payment-webhook/index.ts`.
- One-time SQL backfill for existing rows.
- No changes to `payment_failed`, `notify_on_job_change()`, other insert sites, trigger logic, recipients logic, or the `role` column default.

## Steps

1. **Add `role: "office"` to the insert**
   In `supabase/functions/sumup-payment-webhook/index.ts` (~line 338), change the `notifications` insert payload to include `role: "office"` for every recipient.

   ```ts
   await supabase.from("notifications").insert(
     recipients.map((userId) => ({
       recipient_user_id: userId,
       organisation_id: e.organisationId,
       job_id: e.serviceCallId,
       notification_type: "payment_collected",
       role: "office",
       title: `${kind} — ${ref}`,
       body: `€${e.amount.toFixed(2)} paid by card (SumUp)${e.fullyPaid ? " — full payment" : " — deposit"} on ${ref}${customerName ? ` for ${customerName}` : ""}`,
       metadata: { source: "sumup", amount: e.amount, fully_paid: e.fullyPaid },
     })),
   );
   ```

2. **Run one-time backfill**
   Execute exactly this update and report rows affected:

   ```sql
   UPDATE notifications
   SET role = 'office'
   WHERE notification_type = 'payment_collected'
     AND role = 'engineer'
     AND metadata->>'source' = 'sumup';
   ```

3. **Verify**
   Run the breakdown query before and after the backfill:

   ```sql
   SELECT role,
          metadata->>'source' AS source,
          COUNT(*) AS count,
          MAX(created_at) AS latest
   FROM notifications
   WHERE notification_type = 'payment_collected'
   GROUP BY role, metadata->>'source'
   ORDER BY role, source;
   ```

   Expected outcome: the 3 rows currently `role = 'engineer', source = 'sumup'` move to `role = 'office', source = 'sumup'`, and the 18 rows with `role = 'office', source = NULL` remain unchanged.

## Current pre-fix counts
| role | source | count | latest |
|------|--------|-------|--------|
| engineer | sumup | 3 | 2026-08-13 10:50:13 |
| office | NULL | 18 | 2026-08-11 20:34:42 |
