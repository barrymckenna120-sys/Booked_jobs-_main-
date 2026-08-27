# DeclinedPayments deposit-link branch

## What this does
Fix `handleSendLink` in `src/pages/DeclinedPayments.tsx` so deposit-required jobs that have not yet paid their deposit invoke `send-deposit-link` (€11 deposit) instead of `send-payment-link` (full €22 balance).

## Diff
```diff
--- a/src/pages/DeclinedPayments.tsx
+++ b/src/pages/DeclinedPayments.tsx
@@ -103,8 +103,10 @@ const DeclinedPayments = () => {
     const job = r.service_calls;
     if (!job) return;
     setSendingId(r.id);
     try {
-      const { data, error } = await supabase.functions.invoke("send-payment-link", {
+      const isDeposit = job.deposit_required && !job.deposit_paid;
+      const fn = isDeposit ? "send-deposit-link" : "send-payment-link";
+      const { data, error } = await supabase.functions.invoke(fn, {
         body: { service_call_id: job.id },
       });
```

## Why this is safe
- The row type already exposes `deposit_required` and `deposit_paid`.
- `send-deposit-link` already exists and follows the same `{ success, customer_name }` response contract as `send-payment-link`.
- No other file is changed; `send-payment-link/index.ts` and the `message_log` insert issue are untouched as requested.

## Verification
- TypeScript typecheck.
- Existing unit tests (finance/outstanding balances).
- Manual browser check on Finance → Declined, clicking "Send New Payment Link" for a deposit-required row.
