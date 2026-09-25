# SumUp decline on checkout c-93275d30 — findings (read-only)

## What SumUp says about merchant M9GH65GY (K&N Ltd key)
- `details_submitted: false`
- `merchant_profile.complete: false`
- Company "kngasservicesltd", Ltd, IE, EUR, signed up 15/09/26, `extdev: true`
- So the profile is unfinished (KYC not done). It cannot take real payments until that's completed in Barry's SumUp account.

## What SumUp says about the checkout itself
- It was **not created for M9GH65GY**. SumUp shows `merchant_code: MBBMEYG7`, merchant name "BookedJobs", `merchant_sandbox: true`.
- €120, created 25/09/26 13:05 UTC, `checkout_reference` empty, description "BookedJobs", return link = our payment webhook.
- Status `PENDING`, **no transactions recorded**. SumUp has no record of a card attempt being processed or declined on this checkout.

## Did our code create it?
- Probably not. BookedJobs has no record of this checkout anywhere (jobs, payment attempts, payments ledger, function logs). Our code always sets a checkout reference and an "Invoice …" description; this one has neither. It looks like it was created by hand or from Make, using the MBBMEYG7 sandbox merchant.

## Conclusion
- Two separate issues:
  1. M9GH65GY is incomplete on SumUp's side — needs KYC in Barry's account (not a code fix).
  2. The declined checkout didn't use M9GH65GY, and it wasn't made by BookedJobs code. The "declined" message came from SumUp's payment page, and SumUp didn't record it as a transaction.
- Also worth noting: K&N's settings say "live" but point at M9GH65GY (still true, fix before go-live).

## Suggested next steps (nothing done yet)
1. Barry finishes the M9GH65GY profile/KYC in SumUp.
2. Confirm who/what created the MBBMEYG7 checkout (Make scenario or manual).
3. No more card tests until 1 and 2 are settled.
