# SumUp webhook: allow a second genuine payment (layer-2 guard)

Scope: `supabase/functions/_shared/sumupWebhook.ts` and its adapter `supabase/functions/sumup-payment-webhook/index.ts` (+ existing unit tests). Nothing touching `job_payments`.

## 1. Current logic (verified, unchanged)

Shared module, `sumupWebhook.ts:478-492` — after the layer-1 claim, before `buildPaymentPatch`:

```ts
if (deps.hasOtherClaimedEvent) {
  let priorClaimed: boolean;
  try {
    priorClaimed = await deps.hasOtherClaimedEvent({ serviceCallId: job.id, checkoutId });
  } catch (_e) { /* log */ return { outcome: "duplicate_check_failed", status: 500, ... }; }
  if (priorClaimed) return { outcome: "duplicate", status: 200, jobId: job.id, amount };
}
```

Adapter implementation, `sumup-payment-webhook/index.ts:173-199`:

```ts
supabase.from("sumup_webhook_events")
  .select("checkout_id")
  .eq("service_call_id", serviceCallId)
  .neq("checkout_id", checkoutId)
  .limit(1)
// PGRST116 -> false; any other error or transport failure -> throw (500, SumUp retries)
```

So: **any** claimed event on the job under a different checkout id kills the current event. A deposit via `send-deposit-link` followed by a balance via `send-payment-link` is exactly that shape, so the balance payment is discarded.

## 2. What layer 2 was actually protecting

Layer 1 (`sumup_webhook_events.checkout_id` UNIQUE) already covers SumUp's own re-delivery schedule (1 min / 5 min / 20 min / 2 h) — same checkout id, insert fails, no-op.

Layer 2 was added for the case layer 1 misses: **two different checkout ids representing the same intended money.** Before/alongside BJ-0050a, each resend of a payment link minted a fresh checkout (`jobId::attempt`), so one job could hold several live links for the same amount. If the customer opened an older link, or Make created a checkout in parallel with ours, two distinct checkout ids could both go PAID for one intended payment. Layer 2 also deliberately avoided reading `deposit_paid` / `payment_status`, because the New Job wizard used to stamp `deposit_paid` with no money behind it — so the only trustworthy "already paid" signal it had was a prior claimed event row.

Two things have changed since:
- `findReusableCheckout` now reuses the latest still-PENDING checkout when the amount matches, so a resend of the *same* amount no longer mints a second id. Genuinely duplicate concurrent ids for one intended payment are now the exception, not the norm.
- Two distinct PAID checkouts really are two real card charges. Blanket-dropping the second one hides money rather than protecting anything.

Conclusion: layer 2 as written is the wrong shape. The residual risk it guarded (two live links for the same amount both paid) is better handled by making the payment math cumulative and, if we want a same-amount guard at all, scoping it narrowly — not by rejecting every second payment on a job.

### Proposed narrowing

Replace the per-job guard with a **same-amount, short-window** guard, keeping the dependency name and the strict error buckets:

- Guard fires only when a prior claimed event on this job has (a) a different checkout id, (b) the same amount (to the cent), and (c) `created_at` within a small window (proposal: 24 h). That is the "two links for one intended payment" case.
- Any prior claimed event with a *different* amount, or outside the window, no longer blocks: the event proceeds to `buildPaymentPatch` and `updateJob`.
- Error handling unchanged: query failure still throws -> `duplicate_check_failed` / 500 so SumUp retries rather than risking a double-apply.
- Requires the amount to be readable per prior event. `sumup_webhook_events` has no amount column, so the adapter joins the amount from `payment_checkout_attempts.checkout_id` (already unique) for the prior checkout ids. If the amount cannot be resolved for a prior event, treat it as *not* a duplicate (fail-open on classification, since layer 1 still covers re-delivery and the money is real) and log it.

If you prefer the simpler route, the alternative is to drop layer 2 entirely and rely on layer 1 plus the cumulative math in point 3. Say which you want; the plan below is written for the narrowed version and reduces to a deletion if you pick that.

## 3. `fullyPaid` / patch type for a balance payment — currently WRONG

Today, `sumupWebhook.ts:447-449` and `496-512`:

```ts
const amount    = Number(view.amount ?? 0);     // this checkout only
const revenue   = Number(job.revenue ?? 0);     // job total
const fullyPaid = revenue > 0 ? amount + 1e-9 >= revenue : amount > 0;
...
buildPaymentPatch({ type: fullyPaid ? "full" : "deposit", amount, revenue,
                    currentBalanceDue: job.balance_due, revenueMode: "fill",
                    markDepositPaid: true })
```

No prior payment is considered. For a €500 job with a €250 deposit already paid (`balance_due = 250`), a €250 balance checkout gives `fullyPaid = false`, `type: "deposit"`, and the `deposit` branch of `buildPaymentPatch` sets `balance_due = 500 - 250 = 250` and `payment_status = "partial"` — i.e. even once unblocked, the job would still show €250 outstanding after being paid in full.

So unblocking alone is not enough. The classification must be made cumulative:

```ts
const collectedToDate = revenue > 0 && job.balance_due != null
  ? Math.max(0, revenue - Number(job.balance_due))
  : 0;
const fullyPaid = revenue > 0 ? collectedToDate + amount + 1e-9 >= revenue : amount > 0;

buildPaymentPatch({
  type: fullyPaid ? "full" : "balance",
  amount, revenue, collectedToDate,
  revenueMode: "fill",
  markDepositPaid: true,
})
```

`buildPaymentPatch`'s `balance`/`full` branch derives `balance_due = max(0, revenue - (collectedToDate + amount))` and `payment_status = paid | partial`, never rewrites `revenue` (except `fill` on an unpriced job), and still forces `deposit_paid = true`. Checked against the existing branches:

- Balance €250 on €500 with €250 collected -> `full`, `balance_due = 0`, `paid`.
- First €250 deposit on €500 (`balance_due = 500`) -> `collectedToDate = 0`, `balance`, `balance_due = 250`, `partial`, `deposit_paid = true` — same effective outcome as today's `deposit` branch.
- One-shot €500 on €500 -> `full`, `balance_due = 0`, `paid` — unchanged.
- Unpriced job (Make Scenario 5, `revenue` null) -> `collectedToDate = 0`, `fullyPaid` from `amount > 0`, `revenueMode: "fill"` writes `revenue = amount`, `balance_due = 0`, `paid` — unchanged.
- Overpayment -> `balance_due` clamps at 0, `paid`.

## Implementation steps (after you approve)

1. `sumupWebhook.ts`: derive `collectedToDate` from `revenue - balance_due`, make `fullyPaid` cumulative, pass `type: fullyPaid ? "full" : "balance"` with `collectedToDate`.
2. `sumupWebhook.ts`: extend the `hasOtherClaimedEvent` dep signature with `amount` and a window, and update the doc comment to state that a second genuine payment must pass.
3. `sumup-payment-webhook/index.ts`: reimplement the guard as same-amount + 24 h window (amount resolved via `payment_checkout_attempts`), keeping the throw-on-error buckets.
4. `sumupWebhook.test.ts`: keep the existing re-delivery (layer 1) and error-bucket cases; retarget the two layer-2 tests (lines ~246, ~409); add regression tests for deposit-then-balance -> `paid` with `balance_due = 0`, and same-amount-within-window -> still `duplicate`.

## Notes

- No `job_payments` work here.
- Money path, so full test coverage before deploy; no data backfill in this step. KN-520-style historical jobs that lost a balance payment would need a separate, review-gated data fix.
