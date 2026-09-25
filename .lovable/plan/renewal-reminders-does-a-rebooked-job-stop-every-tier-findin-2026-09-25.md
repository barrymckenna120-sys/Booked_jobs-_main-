# Renewal reminders: does a rebooked job stop every tier? (findings)

## Automatic reminders (sent from Make): yes, all of them
Every automatic tier checks for **any** open job, whichever reminder led to the booking:

| Reminder | Skips the customer if they have… |
|---|---|
| 30-day | a Pending/Booked/Confirmed/Scheduled job dated today or later |
| 14-day | the same check as the 30-day |
| 7-day | any Pending/Booked/Confirmed/Scheduled job, at any date (stricter) |

- So if someone rebooks from the 30-day message, the 14-day and 7-day reminders leave them out.
- The job doesn't need to have come from a reminder; any open future job counts.
- The "already sent" markers are separate and per tier. They only stop the same tier from repeating.

Small caveat: the 14-day and 30-day checks only count jobs with a date. A rebooking saved with no date wouldn't block them. The 7-day check still would, because it ignores dates.

## The gap: the office "Send reminder" button (Renewals page)
- It **doesn't check for booked jobs at all**. It checks opt-out and a 20-hour repeat-send block, then sends.
- The Renewals list doesn't hide customers who already have a job booked.
- So office staff could send a renewal reminder to someone who has already rebooked. This is a manual action, not an automatic one.

## Proposed fix (only if you want it; nothing changed yet)
1. In the office send, skip customers with an open job dated today or later (the same rule as the 14/30-day reminders) and show a clear "Already booked" message instead of sending.
2. Add one regression test.
3. Deploy only that one function, after your approval.

Optional, as a separate step: decide whether a rebooking with no date should also block the 14/30-day reminders.
