

## Plan: Add diagnostic logging to invite-team-member

The function already has a try/catch, but lacks early-entry logging and request body logging. Three targeted additions:

### Changes to `supabase/functions/invite-team-member/index.ts`

1. **Line 8** — Right after `Deno.serve(async (req) => {`, before the OPTIONS check, add:
   ```typescript
   console.log("invite-team-member called", req.method);
   ```

2. **Line 22** — Right after parsing the request body, add:
   ```typescript
   console.log("Request body:", { engineer_id, email, name, role });
   ```

3. **CORS headers** — Update `Access-Control-Allow-Headers` to include the extended Supabase client headers that may be causing preflight failures:
   ```
   authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
   ```

4. **Redeploy** the function and check edge function logs.

### Technical detail

- The existing try/catch on line 120 already logs and returns 500, so no structural change needed there.
- The CORS header update is important — newer Supabase JS clients send extra headers that must be explicitly allowed, otherwise the browser blocks the preflight and the function appears to return a non-2xx with no logs.

