# Engineer app v3 — remaining changes (job card + header)

Scope: the engineer job card and the engineer header only. The job detail screen is untouched. The primary action stays inline on the card (no sticky bottom bar). Already shipped today: full-width Complete with the "Can't complete this job?" reveal, Order Parts entry point, standalone Take Payment.

## 1. Contact popover — three buttons become one

File: `src/components/engineer/job-card/QuickActions.tsx`

Today the row is Call / WhatsApp / Nav / Details, four equal buttons. Replace the first three with a single "Contact" button that opens a small popover with Call, WhatsApp, and Navigate rows. Details stays as its own button; the Certificates button underneath stays exactly as it is, badge included.

- Local `useState` for the popover; tap-outside closes it.
- The three handlers (`openPhone`, `openWhatsApp`, `openNav`) move into popover rows unchanged — same `tel:`, `wa.me`, and Google Maps URLs, and the same iOS-safe opening path already used here.
- Each row keeps a 44px minimum tap target and its existing Lucide icon.

## 2. Payment becomes a banner, not a footnote

File: `src/components/engineer/job-card/InfoPills.tsx`

Currently an outstanding balance shows as a small grey line plus an 11px "Take Payment" text link — easy to miss. Replace that with a full-width banner styled like the amber warning treatment: label on the left ("Deposit due" / "Balance due" / "Payment due" with the amount), "Take Payment" on the right, the whole banner tappable.

- The banner only renders when money is actually owed. Nothing owed, no banner.
- `resolveDepositPill` keeps `resolvePaymentSheetState` as the single source of truth; the change is presentational only. The "Deposit €X paid" success pill stays in the pill row.
- Banner colours use the existing `warning` tokens, not hardcoded hex.
- `onTakePayment` prop and the standalone payment flow in `EngineerJobCard.tsx` are unchanged.

## 3. Header overflow menu

File: `src/components/engineer/EngineerLayout.tsx`

Collapse Order Parts, Back to Office, and Log Out into one overflow (`MoreVertical`) menu. The notification bell stays visible on its own — it's the one item worth a glance every time.

- Local `useState` for the menu, full-screen click-catcher behind it to dismiss, menu panel above the card layers.
- Back to Office keeps its existing `canSwitchToOffice` gate; Order Parts and Log Out remain visible to everyone.
- Log Out keeps the destructive styling and existing handler. Bottom nav untouched.

## Verification

- Unit test for the payment banner label/amount mapping across the deposit-due, deposit-paid-with-balance, and nothing-owed cases (extends the existing `depositPill.test.ts` coverage).
- Manual pass on `/engineer/today` at mobile width: Contact popover dials/opens WhatsApp/opens maps, payment banner opens the payment sheet, header menu navigates and logs out.
- Confirm no console errors and that Complete, Cancel, No Access, and Parts Needed still behave as they do today.

## Risk

Low — presentation and local UI state only. No schema, RLS, payment logic, or status transitions change.
