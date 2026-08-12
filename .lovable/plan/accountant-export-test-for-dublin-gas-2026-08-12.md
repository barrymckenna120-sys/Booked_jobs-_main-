# Accountant export test for Dublin Gas

## Important: no change needed to accountant_email

The read-only check already returned the current value for Dublin Gas
(`organisation_id f1950683-e8b9-41cf-8972-2aa59516850d`, settings row
`f54ff110-c037-4bf3-acd2-46cfd96d2ede`):

```text
accountant_email = barrymckenna120@gmail.com
```

That is exactly the value you asked me to set it to, so step 1 (temporary update)
and step 4 (revert) are both no-ops. Nothing gets written to the settings row, and
there is no test value left behind to clean up.

If you actually meant a *different* address for the test, tell me which one and
I'll do the set/revert pair around the run.

## What I will do

1. Confirm once more, read-only, that `accountant_email` is unchanged before the run.
2. Drive the real UI in a headless browser against the running app using the
   injected preview session: sign-in state is restored from the preview session,
   then navigate to Finance -> Sales Ledger and click the accountant export action
   with the month set to last month (July 2026).
   - No direct function call, no `organisation_id` in any body — the export runs
     through the same authenticated path a user would take, so `verify_jwt = true`
     and the server-derived org are both exercised.
3. Capture: the network response for `generate-accountant-export` (status + body),
   any console errors, and a screenshot of the resulting UI state.
4. Read the edge function logs for that invocation, plus `email_send_log` /
   `message_log` rows created in that window, to confirm the email was accepted by
   Resend and addressed to the accountant address.
5. Report: did the export generate, did the send succeed, and any errors — including
   the 403 path if the acting session's profile org does not resolve.

## Preconditions I need to check first

- Whether an authenticated Dublin Gas session is actually available to the browser
  harness. If the injected preview session belongs to a different org (e.g. K&N),
  I cannot silently switch tenants; I'll report that and we either sign in to the
  preview as a Dublin Gas user, or use superadmin impersonation if that flow exists
  in the UI.
- Whether Sales Ledger has any July 2026 data for Dublin Gas. An empty month is a
  valid outcome but changes what "did it generate" means, so I'll note row counts.

## Technical notes

- Call site: `src/pages/SalesLedger.tsx` invokes `generate-accountant-export` with
  no `organisation_id`, so it is already compatible with the hardened function.
- The function derives org via `get_my_org_id()` from the caller's JWT and filters
  the ledger query by that value unconditionally.
- Email delivery is Resend from `noreply@bookedjobs.ie`; arrival in Barry's inbox
  can only be confirmed by you — I can confirm acceptance by the provider, not
  final inbox delivery.

## Out of scope

No changes to the export logic, month handling, file format, or the settings row.
