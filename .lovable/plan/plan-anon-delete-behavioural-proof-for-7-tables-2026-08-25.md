# Plan: Anon DELETE behavioural proof for 7 tables

## Read-only findings already confirmed

### DELETE policies query

```sql
SELECT tablename, policyname, permissive, roles, qual
FROM pg_policies
WHERE schemaname='public'
  AND cmd='DELETE'
  AND tablename IN ('customers','job_media','job_messages','job_payments','message_log','notifications','whatsapp_messages')
ORDER BY tablename;
```

Raw result:

```text
customers           customers_delete           PERMISSIVE  {authenticated}  (organisation_id = get_my_org_id())
job_media           job_media_delete           PERMISSIVE  {authenticated}  (organisation_id = get_my_org_id())
job_messages        job_messages_delete        PERMISSIVE  {authenticated}  (organisation_id = get_my_org_id())
message_log         message_log_delete         PERMISSIVE  {authenticated}  (organisation_id = get_my_org_id())
notifications       notifications_delete       PERMISSIVE  {authenticated}  ((organisation_id = get_my_org_id()) AND ((recipient_user_id = auth.uid()) OR (get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'office'::text]))))
whatsapp_messages   whatsapp_messages_delete   PERMISSIVE  {authenticated}  (organisation_id = get_my_org_id())
```

Notable: `job_payments` returned no DELETE policy row.

### RLS flags query

```sql
SELECT c.relname AS tablename,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('customers','job_media','job_messages','job_payments','message_log','notifications','whatsapp_messages')
ORDER BY c.relname;
```

Raw result:

```text
customers           rls_enabled=true  force_rls=false
job_media           rls_enabled=true  force_rls=false
job_messages        rls_enabled=true  force_rls=false
job_payments        rls_enabled=true  force_rls=false
message_log         rls_enabled=true  force_rls=false
notifications       rls_enabled=true  force_rls=false
whatsapp_messages   rls_enabled=true  force_rls=false
```

### Stale comment check

`src/hooks/useUserRole.ts` currently says:

```text
Returns the current user's role by checking if their auth ID
is linked to an engineer record. Falls back to "admin".
```

The implementation falls back to `setRole("engineer")` when no engineer row exists. I am comfortable updating this as a 1-line doc fix only; no functional change is needed.

## Controlled behavioural test to run after approval

Because this step intentionally creates and deletes throwaway database rows, it needs approval before execution.

1. Read minimal required columns and foreign keys for the 7 target tables and dependency tables.
2. Create throwaway Cavan Gas test rows only, using normal backend/admin database access, labelled so they are easy to identify.
3. For each target table, call the public REST API directly with:
   - anon public API key
   - no bearer token
   - no authenticated session
   - DELETE targeting exactly the throwaway row
4. Paste the raw HTTP status and response body for each of the 7 DELETE attempts.
5. If any anon DELETE succeeds, stop immediately and report without cleanup or further investigation.
6. If none succeeds, clean up the throwaway rows using normal backend/admin database access.
7. Confirm cleanup with read-back queries for each throwaway row.

## Out of scope

- No code changes.
- No GRANT or REVOKE.
- No policy changes.
- No broad data reset.
