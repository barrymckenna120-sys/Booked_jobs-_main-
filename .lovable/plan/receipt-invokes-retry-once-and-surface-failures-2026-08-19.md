# Receipt invokes: retry once and surface failures

## Part A — answers (read-only, already run)

Of the 128 Completed jobs with `receipt_pdf_url IS NULL` and `receipt_sent = false`:

- **86** have a `receipt_number`
- **42** have no `receipt_number`

Recent activity, by month of completion:

```text
2026-03   37 rows  (35 with receipt_number)
2026-04   80 rows  (49 with receipt_number)
2026-05    6 rows  ( 1 with receipt_number)
2026-07    1 row   ( 0 with receipt_number)
2026-08    4 rows  ( 1 with receipt_number)
```

So the pattern has **not** stopped: 3 rows fall inside the last 30 days —
KN-449 (10 Aug, card, no receipt number), KN-416 (13 Aug, `payment_method = invoice`,
so no receipt is expected on that path), and KN-494 (19 Aug, card, receipt number
`KN-2026-7584`, the job from the click-through). A fourth, KN-466, has no
`completed_at` at all.

Why it *looks* like occurrences stop around late May: the March/April bulk is
imported/backfilled history rather than live completions (35 of the April rows have
no `payment_method` at all), so those rows never went through the receipt flow. From
May onward the volume is just genuine day-to-day completions, and the failure is
rare and invisible — one or two a month, each swallowed by `console.warn`. KN-494 is
the same failure mode, not a new one.

## Part B — the fix

Single concern: raw `supabase.functions.invoke` calls on receipt paths get routed
through the existing `invokeFunction` wrapper (one session refresh + retry on 401),
and a real failure becomes visible instead of a console line.

### 1. `src/hooks/useEngineerJobs.ts` (line 569)

Today: fire-and-forget invoke, `.catch()` writes `console.warn`, then it immediately
navigates to the receipt screen. Change to:

- `await invokeFunction('send-whatsapp-receipt', { body: { job_id: jobId } })`
- Treat both a thrown error and a returned `error` as failure.
- On failure show a destructive toast: title "Job completed — receipt not sent",
  description "Tap Send via WhatsApp on the receipt screen to try again."
- Navigate to `/receipt-view/:jobId` in both cases (completion itself succeeded —
  the job must not appear stuck).

### 2. `src/pages/ServiceReceipt.tsx` (line 142)

`generate-receipt-pdf` invoke swapped for `invokeFunction`. Same return shape, so
`generateReceiptPdf` keeps returning `string | null` and the existing "Could not
generate receipt PDF" toast in `handleDownloadPdf` stays as the visible state. The
receipt's own client-side rendering is untouched.

Its `send-whatsapp-receipt` invoke (line 172) already surfaces a toast; it also gets
the wrapper so the auto-send on page load retries once — that is the recovery path
the engineer-side toast points at.

### 3. `src/components/payments/TakePaymentModal.tsx` (lines 249, 253, 273)

- 249 `generate-receipt-pdf` — via `invokeFunction`; on failure a destructive toast
  "Receipt PDF not generated" (payment itself already succeeded, so navigation to
  the receipt view still happens).
- 253 `send-payment-received` — via `invokeFunction`; on failure a destructive toast
  "Payment confirmation not sent".
- 273 `send-whatsapp-receipt` — via `invokeFunction`; keeps its existing toast.

### Explicitly out of scope

`EngineerLayout.tsx`, `useNetworkStatus.ts` (the 401 probes are by design), payment
logic, `paymentUpdate.ts`, anything under BJ-B4, and receipt rendering.

## Verification

1. Unit test for the new failure branch: a mocked `invokeFunction` returning a 401
   then succeeding proves one retry; returning an error twice proves the toast path.
2. Full suite (`vitest run`) plus `tsgo` typecheck.
3. Live repro on a scratch job in the engineer app: complete it with the
   `send-whatsapp-receipt` request forced to fail (Playwright route interception
   returning 401), and capture a screenshot showing the retry in the network log and
   the visible failure toast — instead of KN-494's silent completion. The scratch
   job will be labelled "ZZ SCRATCH" and no message reaches a real customer.

Diff, test output and repro screenshot will be shown before this is called done.
