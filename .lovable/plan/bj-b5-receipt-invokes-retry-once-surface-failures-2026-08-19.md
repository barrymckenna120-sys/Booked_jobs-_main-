# BJ-B5 — Receipt invokes: retry once, surface failures

## Answers first

### 1. The 42 rows with no receipt number — separate failure class

Split of the 129 Completed rows with `receipt_pdf_url IS NULL AND receipt_sent = false`
(87 with a receipt number, 42 without — the count moved by one because of today's scratch jobs):

| | has receipt_number (87) | no receipt_number (42) |
|---|---|---|
| Date span | 2026-03-05 → 2026-08-19 | 2024-11-20 → 2026-08-13 |
| Missing `completed_at` | 8 | 35 |
| Missing `payment_method` | few | 29 |
| Orgs | K&N only | K&N 38, Dublin Gas 4 |
| Payment status | paid / partial / pending / unpaid | paid / pending / unpaid |

The 42 are a **different class**. A receipt number is minted by the completion/payment
path, so a row that has none never ran that path: 35 of 42 have no `completed_at`
and 29 have no `payment_method`, and they reach back to Nov 2024 — i.e. imported
historical jobs plus jobs whose status was set to Completed directly (office edit,
invoice-only jobs). There is nothing for a receipt send to have failed at.

The 87 are the class this task is about: they did complete, got a receipt number,
and then the background `send-whatsapp-receipt` / `generate-receipt-pdf` call
failed and vanished into `console.warn` (KN-494 is the freshest example).

Not fixing either group here — classification only.

### 2. KN-466 — separate data anomaly, noted not dropped

KN-466: `status = Completed`, but `completed_at`, `scheduled_date`, `payment_method`
and `revenue` are all NULL and `payment_status = unpaid`. It is one of the 42, so
it belongs to the "never ran the completion path" group, not to the receipt-invoke
failure this task fixes. Out of scope, deliberately left alone, logged here so it
is not silently dropped — worth its own ticket alongside the other 34 rows with a
Completed status and no `completed_at`.

## Scope of the change

Single concern: receipt-path invokes go through the existing `invokeFunction`
wrapper (refresh session + one retry on 401), and silent failures become visible
toasts. No payment logic, no `paymentUpdate.ts`, no receipt rendering, no
`EngineerLayout.tsx`, no `useNetworkStatus.ts`.

- `src/hooks/useEngineerJobs.ts` (~line 569) — `send-whatsapp-receipt` awaited via
  `invokeFunction`, wrapped in try/catch so a thrown error and a returned `error`
  both count as failure. Destructive toast "Job completed — receipt not sent" /
  "Tap Send via WhatsApp on the receipt screen to try again". `navigate` to
  `/receipt-view/:jobId` happens on both paths.
- `src/pages/ServiceReceipt.tsx` — `generate-receipt-pdf` (line ~142) and the
  auto-send `send-whatsapp-receipt` (line ~172) via `invokeFunction`.
  `generateReceiptPdf` still returns `string | null`; both existing toasts unchanged.
- `src/components/payments/TakePaymentModal.tsx` — `generate-receipt-pdf`,
  `send-payment-received`, `send-whatsapp-receipt` via `invokeFunction`, with
  "Receipt PDF not generated" and "Payment confirmation not sent" toasts; the
  WhatsApp call keeps its existing toast. Payment already succeeded, so the
  receipt view is still reached on failure.

## Two wrapper defects the repro exposed (in scope, they are what makes the retry work)

1. **The retry never fired.** `invokeFunction` read the status from
   `error.context.response.status`, but the live 401 arrives as a
   `FunctionsHttpError` whose Response sits on `error.context` itself. Status
   resolves as `ctx.status ?? ctx.response.status` so both shapes retry.
2. **A failed refresh signed the engineer out** mid-completion. `invokeFunction`
   gains `signOutOnRefreshFailure` (default `true`, preserving today's behaviour
   for foreground calls like `list-users`); the six background receipt calls pass
   `false` so a failed receipt never ejects the engineer.

## Verification

- `src/lib/invokeFunction.test.ts`: 401-then-success proves exactly one retry;
  401-twice proves the error is returned so the caller's toast path fires; plus
  the `context.status` shape, the non-401 no-retry case, and the sign-out opt-out.
- Full `vitest` run and `tsgo` typecheck.
- Playwright live repro on **both** tenants — a "ZZ SCRATCH" job for K&N and one
  for Dublin Gas — with `**/functions/v1/send-whatsapp-receipt` route-intercepted
  to 401. Complete the job through the engineer card (En Route → On Site → Start
  Work → Complete → Card → Confirm & Complete) and capture: two POSTs to the
  function in the network log (original + post-refresh retry) and a screenshot of
  the destructive toast, with the app still on `/receipt-view/:id` and still
  signed in. No message reaches a real customer.

## Status — two items outstanding

Wrapper defects approved as designed; the code change and the K&N leg are done
(199/199 vitest, clean typecheck, K&N scratch jobs KN-497/KN-495). Remaining:

1. **Unit case: 401 twice → caller receives the error.** New case in
   `src/lib/invokeFunction.test.ts` asserting the resolved value itself — the
   wrapper returns `{ data: null, error }` with the 401 error object to the
   caller (so `ServiceReceipt` / `useEngineerJobs` / `TakePaymentModal` enter
   their toast branch), and the underlying invoke was called exactly twice.
   Both assertions in one case: error surfaced, no third attempt.
2. **Dublin Gas Playwright leg.** Create a "ZZ SCRATCH" job on Dublin Gas
   assigned to a Dublin Gas engineer, sign in as that engineer, intercept
   `**/functions/v1/send-whatsapp-receipt` → 401 for every attempt, run
   En Route → On Site → Start Work → Complete → Card → Confirm & Complete.
   Evidence captured: network log showing two POSTs to the function (original +
   post-refresh retry) and a screenshot of the destructive
   "Job completed — receipt not sent" toast on `/receipt-view/:id` with the
   session still active (engineer nav visible, no redirect to `/auth`).
   Scratch job cleaned up / left flagged after the run.

