# DG-1019 reconciliation, then fixes 1-3, then payment diagnostics

## Step 1 (urgent, first, on its own) — reconcile DG-1019

Confirmed current state of Dublin Gas job DG-1019 (John Murphy, receipt DG-2026-2899):

```text
service_calls: status=In Progress, payment_status=partial, payment_method=card,
               revenue=1537.50, balance_due=1537.50,
               deposit_paid=true, paid_at=10/09/26 21:03:44, completed_at=NULL
job_payments:  amount=1537.50, payment_type=deposit, method=card,
               source=office_modal, paid_at=10/09/26 21:03:44
```

The money is recorded; only the classification is wrong. One isolated data change, no code and no schema:

- `job_payments`: change the single €1,537.50 row's `payment_type` from `deposit` to `payment` so the ledger reads as a full settlement, not a deposit. Amount, method, dates, receipt metadata and row identity untouched — nothing is deleted or re-inserted.
- `service_calls` for DG-1019 only: `payment_status` to `paid`, `balance_due` to `0`. `paid_at`, `revenue`, `receipt_number` and `payment_method` stay exactly as they are.

Deliberately **not** touched in this step:
- `status` stays `In Progress` and `completed_at` stays NULL — completion is a separate operational fact and changing it would fire completion automations (WhatsApp/review/renewal). If the job really was finished on site, it gets completed through the app afterwards, not by a data patch.
- `deposit_required` / `deposit_amount` stay as-is so the original booking terms remain auditable.

Scoped by `job_reference = 'DG-1019'` plus the Dublin Gas organisation id, idempotent (safe to re-run, no effect once already paid), and I report the actual affected row counts and a read-back of both rows afterwards.

Effect for you: DG-1019 shows €1,537.50 paid, €0 outstanding, and it drops out of outstanding-balance and invoice-reminder chasing. This step ships alone and is verified before anything else.

## Step 2 — the three approved fixes (each its own change)

**2a. Engineer photo upload from the job-card Media sheet.**
`src/components/engineer/MediaSheet.tsx` uploads to `<user id>/<job id>/<file>`, which the storage rules reject because they check the second folder segment against the customer's organisation. Change it to the same shape already working in `PhotoSheet.tsx` / `MediaGallery.tsx`: `customers/<customer id>/<job id>/<file>`, pass the file's content type, and surface upload and `job_media` insert errors instead of swallowing them. This is the bug the monitoring alerts flagged; the earlier fix only covered the other screen.

**2b. Log Out works on weak or switching networks.**
`useAuth.tsx` awaits `supabase.auth.signOut()` with no timeout, so on a stalled connection the tap does nothing visible. Bound it with the existing `withRequestTimeout` helper, and navigate to `/auth` and clear local session state regardless of whether the network call resolves. Same treatment for the duplicate sign-out path in `AppLayout.tsx`, so both routes behave identically. The More sheet keeps its current behaviour of closing immediately, but the sign-out now always completes locally.

**2c. Login after Wi-Fi to 5G handover.**
`src/pages/Auth.tsx` races the sign-in against a 15s timer without aborting the underlying request, so a stale request can resolve after the UI has already reported a timeout, and a late auth event can navigate unexpectedly. Give the sign-in and the lockout check a cancellable request with the shared timeout utility, ignore any response from an attempt already abandoned, and allow an immediate clean retry. Also bound the `pageshow` session check so a transient null result on network handover can no longer sign the user out. Lockout behaviour, attempt counting and messaging stay exactly as they are.

## Step 3 — payment diagnostics only (no payment logic changes)

Add diagnostic logging around the engineer/office payment completion write: the before-state, the calculated patch, the real error code and message from the `service_calls` update, and any later write that overwrites the result. Stop mapping every completion failure to "No connection" — show the actual failure while leaving the retry queue behaviour untouched.

Once that lands I can tell from real data whether DG-1019's misclassification came from the payment plan writing `deposit` for a full payment, or from a second write overwriting a correct one. Only then do I propose a payment-code fix plus a regression test for a full payment on a deposit-configured job.

## Verification

- Step 1: read back both DG-1019 rows and confirm it no longer appears in outstanding balances or reminder candidates.
- 2a: authenticated device-width run through the job-card Media sheet, photo lands in storage and `job_media`, plus a deliberate failure to confirm the error is now shown.
- 2b/2c: throttled and offline runs for sign-out and sign-in, confirming a stalled network still signs out and a handover still allows a clean retry.
- Typecheck, full test suite and `git diff --check` on every step.

## Technical notes

- Step 1 is a data change through the SQL tool only, isolated from all code changes per the DB-write isolation rule.
- No schema, RLS, grant or tenant-isolation changes anywhere in this plan.
- Steps 2a-2c and step 3 are independently revertible.
