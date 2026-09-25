# Findings: review WhatsApp and STOP replies (read-only, nothing changed)

## 1. Google review WhatsApp never arrived

The review request was never triggered. It could not have been, for three reasons:

1. **The test job was never marked Completed.** No K&N job was completed today. KN-013, the only K&N job updated today (13:23), is still Pending, unpaid, with no completion time. KN-014 and KN-015 are Scheduled, and KN-005 is Booked.
2. **Only one screen sends the request.** It only goes out when an engineer marks a job Completed on the engineer job screen. Completing or paying a job from the office screens, or through SumUp payment, does not send it.
3. **K&N has no Google review link saved.** Even if the job had been completed, the request would be skipped on purpose, with the note "no Google review link set up". (K&N's Make review connection is set up.)

The review request has no log entries today. The last one was on 27/08, and it was also skipped because no review link was set. That means Make never received anything, so its history will have nothing for this test.

## 2. "Reply STOP to unsubscribe"

**The STOP handling exists.** When a WhatsApp reply of STOP or UNSUBSCRIBE arrives, the app marks every customer with that number as opted out and turns off their reminders. It also sends "Got it — we've removed you…" and logs it on the customer record. One customer has already been opted out this way.

**But replies aren't reaching it right now.** The last customer reply stored was on 26/08. Today, the inbound WhatsApp connection turned away every incoming call, because they arrived without the required password ("missing/invalid secret", no password sent at all). Whatever passes on incoming WhatsApp messages (360 Messenger or a Make scenario) is not including the password.

**Result:** today, a customer who replies STOP would not be opted out. We tell customers it works, so this is a real gap. The cause is a setup problem on the sending side, not missing code.

## Proposed next steps (each one needs your approval)

1. Add K&N's real Google review link. You supply it.
2. Decide whether completing or paying a job from the office should also send the review request, or stay engineer-only.
3. Find which service calls the inbound WhatsApp connection (360 Messenger or Make) and add the password it expects. Then send a STOP from a test number (McKenna) and check the opt-out is recorded.
4. Retest the review request: have an engineer complete a clearly labelled test job on the engineer app.

No code, data or settings have been changed.
