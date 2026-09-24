# Check Scenario 2 (Tally Rebooking + Payment) against our payment callback

Read-only. Nothing is changed or sent.

## Steps
1. Read the uploaded Scenario 2 blueprint.
2. Check the step that sends the rebooking to our system:
   - the web address it calls
   - that it sends the company's own secret
   - which form answers it sends: phone, email, preferred date and time, and submission ID
3. Check the SumUp step:
   - where the amount comes from
   - which merchant code and key it uses (and whether that is the live KN Gas Services Ltd merchant)
   - whether the checkout reference is the job ID from step 1
   - whether it includes our payment callback link and its secret
4. Check the two WhatsApp steps (9 and 10):
   - what triggers each one
   - whether a "duplicate" reply from our system stops them
   - which company name they show
5. Report the full chain, from submission to job to payment to marked paid, and flag every gap. For example, a payment that would never mark the job paid, or a duplicate that still sends messages.

## Out of scope
Any change to the booking intake, the payment callback or Make. Each fix would be proposed separately after the report.
