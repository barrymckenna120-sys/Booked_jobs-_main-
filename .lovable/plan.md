# Full report: review WhatsApp, STOP replies, and today's booking retry (read-only, nothing changed)

## 1. Google review WhatsApp didn't arrive

The review request was never triggered:
- No K&N job was marked Completed today. KN-013 is still Pending, KN-014 and KN-015 are Scheduled, and none has a completion time.
- The request is only sent when an engineer taps Complete on the engineer job screen. Office completion and SumUp payment don't send it.
- K&N has no Google review link saved, so even a completed job would be skipped on purpose.
- There are no review log entries today. Make never received anything, so its history will be empty for this test.

## 2. STOP replies

- The app does handle STOP. A STOP reply opts the customer out, turns off reminders, sends a confirmation and logs it.
- **Replies are still not getting in after your 360 Messenger key switch.** Since the switch, 360 Messenger has called our inbound connection about every 30 seconds (13:52, 13:53, 13:53, 13:54), and every call was turned away. The call arrives with no password at all.
- Our inbound connection expects the password added to the end of the web address 360 Messenger calls, as `?s=...` (14 characters). The address saved in 360 Messenger for the new key doesn't include it. A new key usually means entering the incoming-message address again, and the password part was left off.
- The last customer reply that got through was on 26/08. Until this is fixed, STOP, CONFIRM and CANCEL replies are all lost.

## 3. Booking retry at 13:53

- A booking confirmation and a €120 deposit link were logged for abdenneur1 at 13:53. The same pair was also logged at 13:24 and 13:06.
- **No new job was created** in BookedJobs for any of these retries. The newest K&N job is still KN-015, from yesterday. BookedJobs' own booking intake has recorded nothing new since 24/09.
- The messages were logged with no customer link, no recipient number and no delivery status. That means they came from a Make scenario, not BookedJobs' booking intake.
- **Branding problem:** the booking confirmation sent to this K&N customer ends with **"Thanks, Dublin Gas."** That wording isn't in BookedJobs, so it's fixed text in the Make scenario. K&N customers would be told they booked with Dublin Gas.
- Each retry also creates a new SumUp deposit link (three today). Earlier ones are still open.

## Proposed fixes (each needs your approval, one at a time)

1. **STOP replies:** in 360 Messenger, set the incoming-message address to the BookedJobs inbound address with `?s=` plus the inbound password on the end. I can give you the exact address format, but I can't see or reveal the password itself. Then send STOP from McKenna's test number and I'll check the opt-out was recorded.
2. **Branding:** change the booking confirmation text in the K&N Make scenario so it uses K&N's name instead of "Dublin Gas."
3. **Bookings not creating jobs:** check in Make which step the booking takes. It should send the booking to BookedJobs so a job is created, not just send the messages.
4. **Review request:** you add K&N's Google review link, then an engineer completes a labelled test job on the engineer app.
5. Optional: have office completion also send the review request.

No code, data or settings have been changed.
