# Dublin Gas on hold — booking fixes re-targeted at K&N Gas Services Ltd

Barry clarified that K&N Gas Services Limited is the company taking real bookings and Dublin Gas is a test account. Nothing on the Dublin Gas list proceeds until that is confirmed. Meanwhile, the three planned fixes apply to shared booking-intake code, so they carry over to K&N Gas Services Ltd's live forms unchanged.

## What changes

- **Step 1 — the past date.** The date/time logging added to the booking endpoint is already live and stamps each entry with the company the booking resolved to. No rebuild needed: the same evidence now comes from a real booking through K&N Gas Services Ltd's own forms (book.kngasservices.ie for new bookings, rebook.kngasservices.ie for rebookings) instead of the Dublin Gas form. When one lands, read the submission log entry for the K&N Gas Services Limited production tenant, report the submitted day/time against the stored job date, then agree the past-date handling rule together before any fix.
- **Step 2 — one booking creating two jobs.** The content-window duplicate check at intake is shared code. Re-test it against K&N Gas Services Ltd bookings; same behaviour and tests as planned, no tenant-specific logic.
- **Step 3 — Schedule honesty.** Unallocated-jobs count for dates outside the visible week and visually marked past booked dates — shared presentation code, applies to all tenants including K&N Gas Services Limited.

## Held until Barry confirms

- Whether Dublin Gas is test-only, and with it, what happens to DG-1023 to DG-1026 and the "test" customer — currently **left untouched as evidence**.
- The deferred fallback-door closure (a booking accepted on the shared platform password trusting a sender's claimed company).

## Out of scope

- No changes to booking creation, tenant resolution, or webhook authentication.
- No changes to, or deletion of, any Dublin Gas jobs.
- SumUp sandbox work stays paused as agreed.
