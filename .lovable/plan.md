# Zjq5rA test at 20:57 UTC: no lead created

## Evidence (read-only)
- The backend function started at 20:57:45 UTC, so the test did reach it.
- No row in `boiler_enquiries` from the last 2 hours, in any org, so there is no lead to show.
- The request log with its status code hasn't come through yet (these logs can lag by a few minutes). Given the missing row, a refusal is most likely, again probably the signature (401).

## Next steps
1. Check again in a few minutes to get the exact status code for the 20:57 request. You can also check the Tally webhook event log for Zjq5rA, which shows the response status and body.
2. If it's a 401, add a short temporary check to the function (one log line; no other code or data changes) recording only:
   - whether a `tally-signature` header arrived, and its length;
   - whether the saved secret is present, and its length;
   - which of the two check methods failed (raw body or re-encoded JSON).
   It never records the secret, the signature or any customer answers.
3. Deploy (with your approval). You resend using Tally's "Retry" on the failed event, so the submission ID stays the same.
4. Fix the cause the log points to:
   - no header: signing secret not saved in Tally;
   - lengths differ: the value was pasted with a space or cut off;
   - same lengths but it still fails: a mismatch in how the signature is checked, which I'd fix in `tallySignature.ts` with a test.
5. Remove the temporary check and redeploy.
6. Read back the evidence you asked for:
   - one lead in c0aa41ac, status NEW, source `kn-website-new-boiler`;
   - notes and photos present;
   - screenshots of Pipeline → Leads on desktop and mobile.

## If it's not a 401
Report the exact status and log reason (e.g. 400 unknown form, or missing phone and email) before changing anything.
