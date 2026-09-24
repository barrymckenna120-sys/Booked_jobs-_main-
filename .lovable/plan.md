# Shorten rebooking links in renewal reminder WhatsApps

## What already exists (reused, not rebuilt)
- **Short-link maker:** `create-booking-link` stores the full link in `booking_links` under a random 6-character code and returns `https://<tenant domain>/b/<code>`.
- **Short-link opener:** the app's `/b/:token` page (`BookingRedirect`) looks up the code and forwards the customer to the stored full link, so the form gets exactly the same prefill.
- **Callers:** `renewal-reminder-14` and `renewal-reminder-30` already build the prefilled link and ask `create-booking-link` to shorten it. If shortening fails, they quietly send the full link.

## Why the full link is going out (confirmed)
`create-booking-link` only accepts links that start with the company's **new-booking** form address. Renewal reminders send the **rebooking** form address, so the request is rejected and the reminder falls back to the long link.
- K&N Gas Services Ltd: new-booking `book.kngasservices.ie`, rebooking `rebook.kngasservices.ie`. **0 short links ever created.**
- Dublin Gas: new-booking `tally.so/r/b5QkdZ`, rebooking `tally.so/r/J9vRzR`. Short links stopped on 04/08/26, which points to the same check.
- K&N Gas Services (old) and Cavan Gas: no rebooking form set, so reminders include **no link at all**. Nothing to shorten until a form is added. The same fix covers them automatically when one is added.

## Changes
1. **`create-booking-link`** (one-line rule change): accept a link if it starts with the company's own new-booking **or** rebooking form address. Every other safety check stays the same: sign-in, company match, customer belongs to that company, https only, and the company's own domain.
2. **`send-renewal-reminder`** (the Renewals page "Send reminder" button): this currently sends its own long link (`?customer_phone=…`) directly. Put that same link through `create-booking-link`, falling back to the current link if shortening fails. The message wording stays word-for-word the same; only the link text changes.
3. No change to `renewal-reminder-14/30`, the `/b/` opener, the forms or rebooking intake.
4. `renewal-reminder-7` builds no rebooking link, so it doesn't change.

## Display-layer only
The customer taps the short link, the app forwards them to the exact full link that was stored, and the rebooking form receives the same fields and values as today. No change to the data or to how rebooking is received. The details are still in the address once the form opens; the short link only stops them showing in the WhatsApp message.

## Verification
- Tests for the updated link rule: new-booking link accepted, rebooking link accepted, another company's form and a lookalike address rejected.
- Deploy both functions explicitly.
- Unsigned call is still rejected. Signed call as K&N Ltd with a rebooking link returns a `kngasservices.bookedjobs.ie/b/…` link. The same test as Dublin Gas returns that company's own domain. Open each short link and confirm it lands on the pre-filled form.
- Read back the `booking_links` rows (the correct company on each) and then delete these test rows.
- Next real 14-day run for abdenneur: the WhatsApp shows a short link, and tapping it opens the pre-filled rebook form.

## Risk
This changes a check in a shared function that Make calls, so it's medium risk. It only widens accepted links to each company's own second form. It doesn't touch payments, customer matching or which company a request belongs to.
