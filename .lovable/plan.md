# Verification plan: reset-auth-block tenant isolation

## Goal
Produce the five requested raw verification items for `reset-auth-block` without code changes:

1. Full file read-back
2. Deploy confirmation or explicit no-deploy statement
3. Live cross-tenant test
4. Live same-tenant test
5. Notification-log check

## Known inputs
- Cross-tenant caller: `officeapp@bookedjobs.ie`
- Cross-tenant target: `btestjuly2025@gmail.com` in Dublin Gas
- State-changing same-tenant unblock test: approved
- Same-tenant admin/blocked target pair: not provided yet

## Steps
1. Re-run a raw full-file read-back of `supabase/functions/reset-auth-block/index.ts` and return the complete output.
2. Retrieve deploy evidence for `reset-auth-block` from the available command/tool history if available. If no exact deploy command/output can be recovered, return exactly that it has not been verified from terminal output rather than claiming deployment.
3. Use a real authenticated session for `officeapp@bookedjobs.ie` and call `reset-auth-block` targeting `btestjuly2025@gmail.com`.
   - Return the exact HTTP status code and full JSON body.
   - Expected result: `403` with `{ "error": "Cross-tenant action not permitted" }`.
4. For the same-tenant unblock test:
   - First identify or receive a same-organisation admin and blocked test user pair.
   - If a suitable blocked test user is not already present, stop and ask for a target rather than unblocking an arbitrary real user.
   - Call `reset-auth-block` from the same-tenant admin session targeting the same-tenant blocked test user.
   - Return the exact HTTP status code and full JSON body.
   - Verify with a direct read query that `auth.users.banned_until` is cleared for that target user and return the exact query/result.
5. Query `message_log` and `whatsapp_messages` for rows created during the test window around steps 3 and 4.
   - Return the exact query text and exact result.
   - Expected result: zero rows attributable to either unblock action.

## Safety constraints
- No source-code edits.
- No schema or data writes except the explicitly approved same-tenant unblock action.
- Do not perform the same-tenant unblock until a safe same-tenant admin/blocked test-user pair is identified.
- Do not expose secret tokens, session JSON, service-role keys, or connection strings in the raw output.
