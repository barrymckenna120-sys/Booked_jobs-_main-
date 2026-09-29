# Fix: office invite for an email that already has a login in another company

## Root cause (confirmed by database read)
- `barrymckenna120+2@gmail.com` already had a login in "test gas 5" (admin, engineer row "pat").
- Adding it as Office in "K&N gas services Ltd" (c0aa41ac) created a new office row there. The invite function found the existing login and linked it to the new row. The login's profile still points at "test gas 5".
- Tenant rules only let the login see rows in its profile's company, so the role check can't see the new K&N office row. No row found means the app falls back to the engineer screen.
- The invite function (`invite-team-member`) silently links a login from another company, which leaves this mismatch.

## Changes
1. **Code, 1 file: `supabase/functions/invite-team-member/index.ts`.** If the email already has a login whose profile belongs to a different company, stop with a clear 409 error: "This email already has a login with another company." Only a superadmin can override. The function won't unlink or relink anything in that case. Same-company re-invites work as before. Deploy the function.
2. **Data fix, as its own reviewed step (you chose to move the login to K&N):**
   - Set this login's profile `organisation_id` to c0aa41ac and `role` to `office`.
   - Keep the K&N office row linked. The old "pat" row in test gas 5 stays unlinked.
   - I'll show the SQL and the before/after rows before it runs.
   - Clear this user's cached role by signing out and back in.
3. **Test:** add one regression test for the cross-company decision (a pure helper plus a Deno test).

## Verification
- Read back the joined profile, engineer row and company for this user. Expect org c0aa41ac, role office, one linked row.
- Sign in as the user (with your approval) and confirm they land on /dashboard with K&N data only.
- Confirm an existing engineer still lands on /engineer/today and an existing admin on /dashboard.
- Run the Deno tests, the app tests and the typecheck.
