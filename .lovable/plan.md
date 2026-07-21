# Fix `create-booking-link` to respect tenant Tally URL and public domain

Live test confirmed the bug is still in production:
- Dublin Gas link (`tally.so/r/Zjgxva`) was stored as `tally.so/r/RGJDy4` (K&N's form).
- Cavan Gas link (`tally.so/r/somefakeform`) was also stored as `tally.so/r/RGJDy4`.
- Both short URLs returned on `kngasservices.bookedjobs.ie/b/...` regardless of tenant.

The previously-proposed code was written to `.lovable/plan.md` only; `supabase/functions/create-booking-link/index.ts` itself is unchanged on disk. This plan applies the change for real and redeploys the Edge Function.

## Scope
Only `supabase/functions/create-booking-link/index.ts`. No other Edge Functions, no schema, no frontend.

## Changes
1. Remove the hardcoded `TALLY_BASE` constant and the logic that strips `full_url` down to its query string and re-anchors it. Store `full_url` verbatim after basic `https://` validation.
2. Remove the hardcoded `SHORT_BASE = "https://kngasservices.bookedjobs.ie/b"`.
3. **Order of operations (per latest requirement):**
   a. Parse + validate request body (`full_url`, `organisation_id` required; `full_url` must be a well-formed absolute `https://` URL).
   b. Call `getTenantPublicUrl(SUPABASE_URL, organisation_id, "/b/<placeholder>")` — or resolve the host once — **before** any insert.
   c. If it returns `null`, return HTTP 500 `{"error":"Tenant public_domain not configured — cannot mint short link"}` immediately. **No row is written to `booking_links`.**
   d. Only after a non-null tenant URL is resolved, run token generation and the 5-attempt uniqueness retry loop and insert the row.
   e. Return `{ short_url, token }` where `short_url` is built from the resolved tenant host + `/b/${token}`.
4. Keep unchanged: token alphabet/length, 5-attempt retry loop logic, response shape, CORS headers, auth handling.

## Deploy step
After writing the file, redeploy via `supabase--deploy_edge_functions` with `function_names: ["create-booking-link"]`. Lovable "Publish" only ships frontend assets and does not redeploy Edge Functions, so this explicit deploy call is required.

## Reporting requirements
When reporting completion I will:
1. Paste the full, current on-disk contents of `supabase/functions/create-booking-link/index.ts`.
2. State explicitly: "Edge Function `create-booking-link` redeployed via `supabase--deploy_edge_functions`." No use of the word "published" or generic "done".
3. Leave curl and SQL verification results for Barry to fill in — I will not describe verification outcomes myself.

## Out of scope
- Adding `public_domain` for Cavan Gas or any other tenant.
- Any changes to `send-renewal-reminder`, `renewal-reminder-14/30`, `send-warranty-whatsapp`, or the `/b/{token}` resolver route.
