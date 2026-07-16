## Verification (read-only)

**Source `src/pages/QuoteAcceptance.tsx` line 165:**
```ts
body: JSON.stringify({ quote_id: quote.id, access_token: token }),
```
✅ `access_token` is present in the invoke body alongside `quote_id`. Source is correct.

**Publish status:** I can't introspect what bundle the CDN is currently serving from plan mode. Frontend changes only go live after an explicit Publish action — Edge Function deploys don't ship them. Since the previous session only redeployed the `accept-quote` and `generate-quote-pdf` edge functions, this frontend change is almost certainly still unpublished.

## Plan

1. Run `preview_ui--publish` to ship the current frontend (includes the updated `QuoteAcceptance.tsx`).
2. After publish is scheduled, fetch `https://kalrsgas.lovable.app/` with cache-bust and grep the built JS bundle for the `access_token` string in the accept-quote call site to confirm the live bundle contains the fix (not a stale cached one).
3. Report the live bundle hash and grep result back to you.

No code changes. Approve to run publish + verification.
