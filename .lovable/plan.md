# Fix Scenario 2 (Tally Rebooking + Payment KNGAS) before a real test

Our booking intake and payment confirmation stay unchanged. Every fix below is made in Make.

## Findings from the blueprint
1. **Step 3 sends to the wrong place.** It sends the rebooking to the new-booking intake, not the rebooking intake.
   - The job is created as a new "Boiler Service" booking with source "Tally".
   - The customer's renewal stage and next service due are not updated.
2. **Step 3 will be refused.** It sends only the public app key, with no company secret. Our intake rejects that before saving anything.
   - Because step 3 is refused, nothing after it can work: no job ID, no checkout and no messages.
3. **Step 39 uses an unknown SumUp merchant.** It uses merchant code MBBMEYG7 with a hardcoded live key.
   - MBBMEYG7 is not any company's merchant in our system. KN Gas Services Ltd is M9GH65GY and Dublin Gas is M9Z8RGV6.
   - Payments could land in an account we don't recognise.
4. **Step 39's payment callback link has no secret.** Our payment check rejects any callback without its secret.
   - A paid deposit would never mark the job paid.
   - The checkout reference is correctly set to the job ID from step 3.
5. **The amount is fixed in Make.** The €120 deposit is set in Make; our system doesn't send any amount.
6. **WhatsApp steps 9 and 10 have no duplicate check.** They run even when our system replies "duplicate".
   - They are signed "K&N Gas Services", while the organisation is KN Gas Services Ltd.
7. **The message logs don't match.** The log in step 6 says "Dublin Gas", and step 13 has no sign-in header.

## Changes (in Make, by you)
- **Step 3:** change the web address to our rebooking intake and add KN Gas Services Ltd's company secret. Send phone, email, preferred date and time, and the Tally submission ID.
- **Duplicate check:** add a filter after step 3 so the checkout and WhatsApp steps run only when the reply is a success and not a duplicate.
- **Step 39:** replace the merchant code and key with KN Gas Services Ltd's own (M9GH65GY).
- **Step 39 callback link:** add the payment callback secret to the end of the link, as `?s=`.
- **Step 6 log:** change "Dublin Gas" to the right company name.
- **Step 13 log:** add the sign-in header.

## After the changes
Run one rebooking for the merged "abdenneur" test customer on a new date. I'll then confirm:
- one job was created
- the renewal stage was updated
- the checkout reference matches the job
- after a real €120 card payment, the payment was recorded and the job marked paid
