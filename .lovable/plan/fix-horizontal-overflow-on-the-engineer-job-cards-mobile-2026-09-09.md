# Fix horizontal overflow on the Engineer job cards (mobile)

## What's wrong

Confirmed by measuring the live Engineer screens at phone widths (320px and 390px), on both Upcoming and Today:

- The row of small action buttons under a job — Note, Media, Video, Extra Work — is wider than the card it sits in (262px of buttons in a 243px card at 320px). The last button gets pushed past the card edge, which is the cut-off "Extra W" visible in the screenshot.
- The "Send a message to office" input row is also wider than its card (237px in 215px), because the round send button and padding aren't accounted for.
- Both rows are shared by every job card, so the same problem appears on Today, Upcoming, Completed and the full job screen, for every company (K&N, Dublin Gas, Cavan).
- The quick-reply chips (On my way / Running late…) are wider than the screen on purpose — they are a side-scrolling strip and stay as they are.

## The fix

- Let the four action buttons shrink and wrap to a second line on narrow phones instead of forcing one row, keeping them full-size and tappable (44px tall) and keeping the same order, labels, icons and colours.
- Allow the message input to shrink properly inside its rounded container so the send button always stays inside the card.
- No change to what any button does, to job data, permissions, or to tablet/desktop layouts.

## Verification

- Re-measure Upcoming, Today, Completed and a job's own screen at 320, 375, 390 and 430px: no element wider than its container except the intentional chips strip.
- Screenshots at those widths, then typecheck and the test suite.

## Technical notes

- `src/components/engineer/job-card/SecondaryActions.tsx` — the `flex gap-2.5` row becomes wrap-capable with shrinkable buttons (`min-w-0`, basis so two fit per line on narrow widths).
- `src/components/messages/EngineerJobMessages.tsx` — input row gets `min-w-0` on the container/input so the flex child can shrink below its intrinsic width.
- Preset chips row (`overflow-x-auto`) left untouched.
