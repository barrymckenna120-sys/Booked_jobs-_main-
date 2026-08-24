# Standalone Take Payment path — ledger, gating and receipts

Scope: `src/hooks/useEngineerJobs.ts` (`updateJob`), plus one new pure helper module and its tests. No changes to `PaymentSheet.tsx`, `TakePaymentModal.tsx`, `buildPaymentPatch`, or the SumUp webhook.

One correction to the brief before starting: the **Complete button path has no `job_payments` insert today** — the only client-side ledger writer is `TakePaymentModal`. So safeguard (c) is "the Complete path keeps behaving exactly as it does now, and gains the same ledger insert as a side effect of sharing the payment branch", not "its existing ledger tests keep passing". There are currently no tests covering `updateJob` at all.

## 1. Completion gating (standalone path)

The standalone path passes no `status`. New logic sits immediately after the cash/card `buildPaymentPatch` call (currently lines 294-303), and only inside the `else` (non-invoice) arm:

```
prior status = (job found in todayJobs/upcomingJobs/completedJobs).status, lowercased
workUnderway = prior === "in progress" || prior === "completed" || prior === "on site" || prior === "en route"
if (!patch.status && dbPatch.payment_status === "paid" && workUnderway) {
  dbPatch.status = "Completed";
  dbPatch.completed_at = <same paidAt ISO string>;
}
```

Two deliberate differences from `TakePaymentModal`:

- `!patch.status` — the Complete path already sets `status` itself; this block never fires there.
- `on site` / `en route` are included because the engineer app moves jobs through those states before work is finished, whereas the office modal only ever sees `In Progress`/`Completed`. A `Booked` job is never auto-completed.

`patch.status` is deliberately **not** mutated (unlike the invoice branch at line 293), so the `patch.status === "Completed"` gates at 314-348 and 442-607 do not fire for a standalone payment. Completion-only work (job tags, next-service sync, customer profile sync, navigation) stays owned by the Complete flow. The DB row is marked Completed; the completion form is still required, and the job surfaces via `isFullyPaidUnfinished`/`todayCompleted` as it does now.

`completed_at` and `paid_at` share one `new Date().toISOString()` value hoisted above the payment branch, so the job row, the ledger row, and the activity row all agree.

## 2. Cumulative `collectedToDate`

`priorCollected(revenue, balanceDue)` already exists at `src/lib/priorCollected.ts` with tests at `src/lib/priorCollected.test.ts`. It is a framework-free pure function, already imported by `TakePaymentModal`. **No extraction or move is needed** — `useEngineerJobs.ts` simply imports the same module. Nothing about the helper changes.

Lines 276-278 (`deposit_paid ? deposit_amount : 0`) are replaced by:

```
collectedSoFar = priorCollected(jobForPayment.revenue, jobForPayment.balance_due)
```

Applies to both the `invoice` and cash/card arms (both currently pass `collectedSoFar`).

Source of truth: unlike the office modal, the engineer path reads `revenue`/`balance_due` from the in-memory job (`jobForPayment`), which is realtime-subscribed and refetched on focus/online. Adding an authoritative pre-write `select` here would break offline capability (the whole point of this path is that it works with no connection), so the in-memory values stay the source. `jobForPayment` is widened to also search `completedJobs` so a re-payment on an already-completed job doesn't silently fall back to `collectedSoFar = 0`.

## 3. `job_payments` insert

Built once, above the `supabase.from("service_calls").update(...)` call, as a fully self-contained literal — nothing re-derived at replay time:

```
organisation_id : jobForPayment.organisation_id
service_call_id : jobId
customer_id     : jobForPayment.customer_id
amount          : Number(confirmedRevenue)
payment_type    : "deposit" | "balance" | "full"   (see below)
method          : paymentMethod                     ("cash" | "card")
source          : "engineer_app"
checkout_id     : null
recorded_by     : profileIdRef.current (cached — see §3b)         [nullable, no FK]
paid_at         : the shared paidAt ISO
metadata        : { receipt_number: <dbPatch.receipt_number ?? null>, entry: <"completion" | "standalone"> }
```

`payment_type` derivation, mirroring `TakePaymentModal:237`:
- `collectedSoFar > 0` → `"balance"`
- else `dbPatch.payment_status === "paid"` → `"full"`
- else → `"deposit"`

Built for **every** cash/card payment through `updateJob` — i.e. both the standalone path and the Complete button path, which is the wiring the Complete path was missing. The `invoice` arm inserts nothing (no money collected).

Failure handling, two branches:

- **`service_calls` update failed (offline):** in the existing error branch (353-372) the ledger row is queued as a **dependent** item (see §3a). The existing "No connection — update saved and will retry automatically" toast is unchanged and covers both.
- **`service_calls` update succeeded:** insert inline right after the activity-row block, wrapped in try/catch. Payment is already on the job, so a ledger failure is loud but non-blocking — same `LEDGER_INSERT_FAILED job_payments` console error and "Payment recorded, but not added to the payment ledger" destructive toast as `TakePaymentModal:289-296`. If the insert itself fails with a network error it is queued via `addToQueue` (no dependency needed — the job row is already correct).

RLS: the insert runs as `authenticated` against `job_payments_insert` (`WITH CHECK organisation_id = get_my_org_id()`). The engineer's `organisation_id` matches the job's, so no policy change is needed.

### 3a. Queue-ordering integrity — dependent items (resolves the divergence direction)

Insertion order alone is not enough: two independent items with independent 3-attempt budgets can drop the `service_calls` update while the later ledger insert succeeds, producing a ledger row for a payment never recorded on the job — the *unsafe* direction, and the reverse of the invariant the SumUp webhook holds.

`useRetryQueue.ts` gains one optional field and matching replay semantics. No transaction is possible across two PostgREST calls, so option (a) is ruled out; this is option **(b)** — a true dependency:

```
RetryQueueItem += dependsOnId?: string
```

`addToQueue` returns the created item's `id` so the caller can chain. In `processQueue`, for each item with a `dependsOnId`:

- dependency **still present** in the queue (not yet replayed) → **defer**: push to `remaining` unchanged and **do not increment `attempts`**, so a dependent never burns its budget waiting.
- dependency **succeeded** in this pass, or is absent because it already succeeded in an earlier pass → replay normally.
- dependency **dropped** (hit `MAX_ATTEMPTS`) → **drop the dependent too**, with a distinct `[retry-queue] dropping dependent of failed item` console error. This is the guarantee: a ledger row can never outlive the job update it belongs to.

Tracking is a `Set` of ids succeeded/dropped within the pass, checked against the ids still in the queue. Existing callers (`EngineerJobDetail`, the three cert flows, `GasInstallationCertForm`, `GasInstallationFlow`, and the boiler-customer update in this hook) never set `dependsOnId`, so their behaviour is byte-identical.

Residual divergence after this change is one-directional only: **job updated, ledger row missing** (job update replays, ledger insert then hits its own 3-attempt cap). That is exactly the direction Step 3's reconciliation already covers, so no widening of the reconciliation query is required — but Step 3 must still be told the `engineer_app` source now exists.

### 3b. `recorded_by` — cached, not fetched at write time

Currently **not** cached: `useEngineerJobs.ts:395` (payment activity row) and `:469` (job-tag `added_by`) each do a live `profiles.select("id").eq("user_id", user.id)` at write time. Offline, both silently resolve to `null`.

Fix: mirror the existing `engineerIdRef` pattern (declared line 67, populated in `fetchAll` around line 134) with a `profileIdRef`, populated by the same online mount-time lookup. The ledger literal reads `profileIdRef.current`, and the two existing call sites at 395/469 are switched to it as well (removing two write-path round-trips). `job_payments.recorded_by` is `uuid` with **no FK and no NOT NULL** — confirmed: the table's four FKs are `organisation_id`, `service_call_id`, `customer_id`, `reverses_payment_id` — so a `null` fallback (engineer opened the app offline from cache and the ref was never filled) is legal and inserts cleanly. It degrades attribution, never the payment record.


## 4. Receipts

### Standalone path (new)

Fired only when `!patch.status && dbPatch.payment_status === "paid" && paymentMethod !== "invoice"` and `isOnline`, after the ledger insert, in the success branch:

1. `receipt_number` — the standalone path currently never gets one (it's inside the `patch.status === "Completed"` gate). A settled-in-full standalone payment now mints one using the identical `settings.cert_prefix` logic, hoisted into a small local helper so the two call sites cannot drift.
2. `invokeFunction("generate-receipt-pdf", { body: { job_id }, signOutOnRefreshFailure: false })` — fire-and-forget with the "Receipt PDF not generated" toast.
3. `invokeFunction("send-whatsapp-receipt", { body: { job_id }, signOutOnRefreshFailure: false })` — fire-and-forget with the existing "receipt not sent — tap Send via WhatsApp on the receipt screen" toast.

No navigation. The engineer stays on the job list; the standalone sheet closes as it does now.

### Stale-PDF handling (the 314-348 gate)

Inside the `if (patch.status === "Completed")` block, in the same `try` that mints `receipt_number` (currently 336-346), the mint becomes unconditional-with-reset: whenever a fresh `receipt_number` is generated there, the patch also clears the stale artefacts so `send-whatsapp-receipt` cannot reuse them:

```
if (orgId) {
  dbPatch.receipt_number  = `${prefix}-${yr}-${rand}`;   // as today
  dbPatch.receipt_pdf_url = null;                        // NEW — forces regeneration
}
```

Placement note: this sits at line ~345, immediately after the existing `receipt_number` assignment, and applies to every completion (payment, invoice, and `onCompleteOnly`) — clearing a URL that is about to be regenerated is safe in all three cases, and it is exactly the case where the job already carries a `receipt_pdf_url` minted by the standalone path that it protects. Because the Complete path already routes to `/receipt-view/:id` after `send-whatsapp-receipt`, and that function regenerates when `receipt_pdf_url` is null, no extra call is added.

## 5. Offline behaviour

`isOnline` (already available in the hook via `useNetworkStatus`) gates the two `invokeFunction` calls. When offline they are **skipped entirely** — the retry queue supports only raw table `insert`/`update` items and cannot carry an Edge Function call, and no new queue mechanism is introduced. The engineer sees the existing "No connection — update saved and will retry automatically" toast; the receipt is sent manually from the receipt screen (or automatically on the next completion, which now clears `receipt_pdf_url`).

## Regression safeguards

**a. `onCompleteOnly` (EngineerJobCard 434-442) byte-identical.** Its patch is `{ status: "Completed", ...completionData }` with **no `paymentMethod`**. Every new behaviour in points 1-4 lives inside `if (paymentMethod)` (lines 271-305) or inside `if (!patch.status && ...)`. Both fail for this branch, so no gating, no ledger insert, no standalone receipt call. The only line it touches that changes is `receipt_pdf_url = null` at ~345, which sits beside a `receipt_number` it was already regenerating — its receipt output is by definition fresh, so behaviour is unchanged. A snapshot test locks this.

**b. Empty-patch refresh (`onUpdate(job.id, {})`).** No `paymentMethod`, no `status`. The `if (paymentMethod)` guard is on the *presence of `paymentMethod`*, never on "patch has content", so `dbPatch.payment_status` is undefined, the point-1 condition short-circuits on `payment_status === "paid"`, and no ledger insert or receipt call is built. It remains a no-op `service_calls` update plus the "Updated" toast.

**c. Complete button path.** Genuinely shared with the standalone path: the `PaymentAmountError` guard, `stripCallerRevenue`/`sanitize`, the whole `if (paymentMethod)` payment branch (including the new `priorCollected` math and the new ledger insert), and the error/queue branch. Newly **branching on `status` presence**: only the point-1 completion gate (`!patch.status`) and the standalone receipt block (`!patch.status`) — both skipped when `status: "Completed"` is present. The Complete path therefore keeps its own `receipt_number` mint at 314-348, its own `send-whatsapp-receipt` at 587-607, and its own `/receipt-view` navigation, unchanged. Behaviour changes for it in exactly two intended ways: cumulative `collectedToDate` (point 2, a bug fix) and gaining the `job_payments` row it was missing.

**d. `PaymentAmountError` guard (226-240).** Untouched and unmoved. It remains the first statement after destructuring and before any read, math, write, or side effect. No new code is inserted above it.

## Test plan

New file `src/lib/engineerPaymentPlan.test.ts` covering a new pure helper `src/lib/engineerPaymentPlan.ts` that the hook delegates to. The helper takes `{ patch, paymentMethod, confirmedRevenue, job }` and returns `{ dbPatchAdditions, ledgerRow | null, fireReceipt: boolean }` — this is what makes the branching testable, since `updateJob` itself is a hook body with Supabase and toast side effects. It contains no imports beyond `buildPaymentPatch` and `priorCollected`.

1. **`onCompleteOnly` unchanged** — `{ status: "Completed", workDone, selectedTags }`, no `paymentMethod`: asserts `ledgerRow === null`, `fireReceipt === false`, and `dbPatchAdditions` contains no `payment_status`/`balance_due`/`paid_at`/`status`.
2. **Empty-patch refresh unchanged** — `{}`: asserts an empty `dbPatchAdditions`, `ledgerRow === null`, `fireReceipt === false`.
3. **Complete-button path unaffected** — `{ status: "Completed", paymentMethod: "card", confirmedRevenue: 400 }` on a €400 job: asserts the helper does **not** add `status`/`completed_at` (the hook's own 314-348 gate owns those), `fireReceipt === false` (the 587-607 path owns the send), and a `full` ledger row is produced. Existing `paymentUpdate.test.ts` and `priorCollected.test.ts` must pass unchanged.
4. **Standalone completion gating** — no `status`, `confirmedRevenue` settling the job:
   - prior `In Progress` → `status: "Completed"` + `completed_at` set
   - prior `Booked` → neither set, `payment_status: "paid"` still written
   - prior `En Route` / `On Site` → completed
   - partial payment on `In Progress` → `payment_status: "partial"`, not completed
5. **Cumulative math** — job `revenue 500`, `balance_due 250` (a €250 deposit already taken, plus the two-partial-payments case `revenue 600 / balance_due 100`): asserts `collectedToDate` comes from `priorCollected`, that a €250 payment resolves to `paid` with `balance_due 0`, and that the old deposit-only assumption would have mis-resolved it to `partial`.
6. **Ledger row shape** — asserts `source: "engineer_app"`, `checkout_id: null`, correct `payment_type` for deposit/balance/full, `amount` from `confirmedRevenue`, shared `paid_at`, and that every FK-required field (`organisation_id`, `service_call_id`, `customer_id`) is present in the literal (self-contained for queue replay).
7. **Receipt firing, paid-but-not-completed** — no `status`, payment settles in full, prior status `Booked`: asserts `fireReceipt === true` while `dbPatchAdditions.status` is absent. Plus `fireReceipt === false` for `paymentMethod: "invoice"` and for a partial payment.

New file `src/hooks/__tests__/useRetryQueue.deps.test.ts` for the §3a dependency semantics (localStorage-backed, Supabase client mocked):

8. **Dependent defers without burning attempts** — job update fails, ledger insert queued with `dependsOnId`: after one pass the ledger item is still queued with `attempts === 0` and no insert was attempted.
9. **Dependent replays after its dependency succeeds** — job update succeeds on pass 2, ledger insert then runs in the same pass and the queue empties.
10. **Dependent is dropped when its dependency is dropped** — job update fails 3 times: the ledger insert is dropped too, is never sent, and the queue empties. This is the invariant test — no ledger row without its job update.
11. **Existing callers unchanged** — an item with no `dependsOnId` replays exactly as today (success clears it; 3 failures drop it).

Run: `bunx vitest run` — full suite green (274 currently) plus the two new files.

