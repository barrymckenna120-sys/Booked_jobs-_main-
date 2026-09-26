# KN-020 card payment error + "Lovable" on desktop notifications

## What the records already show (read-only, confirmed)
- KN-020 (Philip Ward, K&N Ltd): job value EUR 2,460.
  - 16:37 — EUR 1,230 deposit paid through SumUp (checkout PAID, transaction TAAA6L67Q9Y).
  - 16:44 — EUR 1,230 "balance" recorded by the office payment screen as Card (receipt KN-2026-5212), no SumUp checkout attached.
  - Job now shows Paid, balance EUR 0. The "12:30" is EUR 1,230.
- So the payment was **recorded** despite the red error. Whether EUR 1,230 was actually charged on a card for the balance is not proven — there is no SumUp record for it. **Do not take another payment** until this is checked.
- The app's installed name is already "BookedJobs"; the push handler shows whatever title the server sends. The cause of "Lovable" is not confirmed yet.

## Step 1 — confirm causes (read-only)
1. Payment: trace the office "Card → Pay" path, find the exact failing call (likely a later step after the payment row is saved, such as receipt/WhatsApp/invoice sync), and check logs at 16:44–16:45. Confirm with Barry/Karl whether a card terminal was actually charged EUR 1,230.
2. Notifications: check where the "Lovable" label comes from — the site address the notification is sent from (lovable.app domain vs bookedjobs.ie), the notification title, or the browser's in-app notification path — and reproduce on desktop.

## Step 2 — smallest fix (after cause confirmed)
- Payment: fix only the failing step so a successful record shows success, and a real failure shows a clear error without leaving a half-saved payment. No change to how money is charged, no rewriting existing payment rows.
- Notifications: set the name to "BookedJobs" at the confirmed source (1–2 files) and bump the notification worker version so installed apps pick it up.
- If more than 3 files are needed, stop and explain first.

## Step 3 — verify
- Test on a labelled scratch job (Cavan Gas/test data): success, genuine failure, retry — no duplicate payment rows, correct status and balance.
- Desktop notification shows "BookedJobs", including after app update.
- Other tenant cannot see/affect the payment; tests, typecheck, build.
- No deploy without approval; KN-020 records left untouched.

## Technical notes
- Payment rows: `job_payments` sources `sumup_webhook` (deposit) and `office_modal` (balance). Service worker: `public/firebase-messaging-sw.js`; push sender: `send-push-notification`.
