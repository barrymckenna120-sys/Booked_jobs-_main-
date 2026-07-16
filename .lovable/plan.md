## Diagnostic: Re-test accept-quote directly

Run a direct `curl` POST against the `accept-quote` Edge Function with the exact body you provided, then report status code + full body verbatim.

```bash
curl -isS -X POST \
  https://ktkfuquqxbrmuqrmbmdj.supabase.co/functions/v1/accept-quote \
  -H "Content-Type: application/json" \
  -H "apikey: <anon>" \
  -H "Authorization: Bearer <anon>" \
  -d '{"quote_id":"3ed0f71e-e047-417c-b649-f319aabaddcf","access_token":"568ea32e-5606-403e-ad5b-8986ec7527ed"}'
```

Then pull the matching `accept-quote` edge logs for that request to capture any RPC error text.

### Note on expected result
Last test of this exact quote returned **HTTP 500** with body `{"success":false,"error":"Failed to accept quote"}`, caused by the `respond_to_quote` SQL function writing `status = 'accepted'` (lowercase) which violates `quotes_status_check` (expects `'Accepted'`). The row is already in the bad `accepted` state from a prior partial run, so re-running will most likely reproduce the same 500 until the SQL function is fixed. This plan does **not** include that fix — it's a diagnostic re-run only, as requested.

Approve to run the curl and paste the raw response.
