# Findings (1–3) and Scratch Data Cleanup (4)

## 1. KN-484 (Aisling Power) — nothing is owed on record

Live values in `service_calls`:

```text
status            In Progress
scheduled_date    2026-08-20   time_block 11am–2pm
deposit_required  false
deposit_paid      false
deposit_amount    NULL
balance_due       NULL
revenue           NULL
payment_status    unpaid
payment_method    NULL
invoiced_at       NULL
```

There is no deposit requested, no deposit taken, no job total priced and no balance recorded. So there is no outstanding amount stored on this job — the card showing no payment pill is correct behaviour, not a rendering bug. (The job is still In Progress and unpriced; an amount only appears once revenue/deposit values exist.)

## 2. resolveDepositPill against the real KN-484 data

With `deposit_required: false`, `deposit_paid: false`, `deposit_amount: NULL`, this shape classifies as **Case C** in `resolvePaymentSheetState`, and `resolveDepositPill` returns `{ pill: null, balanceLine: null }` for Case C. That is the intended result — Case C is exactly the "straight, unpriced/cash job" case where a `€0 Pending` pill used to be misleading and was deliberately removed. So a non-null pill is not expected here.

## 3. EngineerCompactJobRow payment pill is intact

`src/components/engineer/EngineerCompactJobRow.tsx` still calls `resolveDepositPill(job)` (line 20) and renders the pill under `{pill && (...)}` (lines 50–59), with success/warning tone mapping and the CreditCard/Hourglass icons. Today's job-reference and sort-order changes touched the name row and the time label only — the pill's conditional rendering was not altered.

## 4. Scratch data cleanup — needs approval

KN-509 and KN-510 are **still live** in K&N Gas Services (both "In Progress", both scheduled 2026-08-20, 2pm–5pm). They are not the only survivors — 15 ZZ Scratch jobs remain:

```text
KN-485, KN-492, KN-493, KN-494, KN-495, KN-496, KN-497,
KN-504, KN-505, KN-506, KN-507, KN-508, KN-509, KN-510, KN-511
```

Proposed action (deletion changes data, so it needs your go-ahead):

1. Delete KN-509 and KN-510 through the app's real job-deletion path (office Job Detail → delete), so any dependent rows (media, messages, tags, activity, notifications) are cleaned up the same way a normal deletion would.
2. Re-query for ZZ Scratch rows in K&N and report what remains.
3. Confirm with you whether the other 13 ZZ Scratch jobs (and their scratch customer records) should be removed in the same pass, or deliberately kept.

Nothing else changes; no code edits are part of this.
