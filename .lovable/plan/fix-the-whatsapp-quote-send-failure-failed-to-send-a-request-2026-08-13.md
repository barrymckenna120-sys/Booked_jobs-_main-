# Fix the WhatsApp quote send failure ("failed to send a request to the edge function")

## What the evidence shows

- Acceptance was never the problem. `accept-quote` was not invoked at all in the window (zero log entries), and it is deployed and healthy (live probe returns the expected `400 Missing quote_id or access_token`). Q-2026-0120's data is intact and acceptance-ready.
- The failure is the WhatsApp send. `POST /functions/v1/send-quote-whatsapp` at 14:26:19 never completed — the browser reports `Failed to fetch`, there is no HTTP status or response body, and the function booted at 14:26:18 then shut down at 14:27:14 having emitted **zero** log lines. The request body never reached the handler.
- `send-quote-whatsapp` declares its own local CORS block allowing only:
  `authorization, x-client-info, apikey, content-type, x-org-id`
  Other functions in this project allow a wider list that also includes the `x-supabase-client-platform` / `x-supabase-client-runtime` family sent by the current client SDK. A preflight that omits a header the browser intends to send returns 200 but the browser then refuses to issue the POST — exactly the observed signature (preflight 200, no POST row in edge logs, no handler logs, client-side "failed to send a request").

Note: the browser-blocked-POST diagnosis is consistent with every signal but is not yet proven by a single decisive artifact, because a CORS refusal leaves nothing server-side. Step 1 below proves it before the fix is called done.

## Plan

1. **Prove it.** Replay the exact same POST from a scripted browser against the running app and capture the console CORS message plus the request's failure reason. Compare against a send through a function that uses the full shared header list.
2. **Align the CORS headers.** Bring `send-quote-whatsapp` onto the same allow-list the rest of the project uses, including the client-platform/runtime headers, and add explicit allowed methods. Keep every response (success and error) returning those headers.
3. **Sweep the siblings.** Search all functions for locally declared CORS blocks with the narrow header list and align them in the same pass, so the next function called from the UI does not fail the same way.
4. **Re-verify.** Resend the quote WhatsApp for a fresh test quote in K&N and confirm: a real HTTP status and JSON body come back, the function logs its handler lines, and a `message_log` row is written. Then clean up the test quote and rows.

## Technical notes

- `supabase/functions/send-quote-whatsapp/index.ts` lines 5-8: replace the local `corsHeaders` allow-list with the project's standard list and add `Access-Control-Allow-Methods: POST, OPTIONS`.
- No change to `accept-quote`, `_shared/depositLink.ts`, or any acceptance/deposit logic — the audit clears that path.
- No database migration; no schema change.
- Regression coverage: the send path is a network/header concern, so verification is the live re-send plus edge logs rather than a unit test.
