# KN-2026-8823 shown in two WhatsApps

## What the records show
- Receipt KN-2026-8823 belongs only to KN-001 (test company). No other job uses that number.
- BookedJobs has exactly one message naming it: the receipt sent at 11:21:07 Irish time (10:21 UTC). The job was marked "receipt sent" at the same moment.
- The part-payment message at 11:16 does not include a receipt number.

So the second copy on the phone was not recorded by BookedJobs. Cause is unconfirmed.

## Steps
1. Read-only: check the WhatsApp provider's send history (360Messenger) for the test company's number around 11:21 through the connected account. The question is whether it received one send request and delivered it twice, or received two.
2. Read-only: list any Make scenario or other automation that sends receipts on payment for this company, from the code and settings that reference it.
3. Report the evidence. No code changes unless the second send is traced to BookedJobs. If it is, fix only that sender (1–2 files) with a regression test, then re-test on the test company with a scratch number.

## Technical details
- No database writes, no deploys, no messages to real customers.
