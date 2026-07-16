## RLS check — PASSED

```
quotes_select | SELECT | (organisation_id = get_my_org_id()) | {authenticated}
```

Staff-side reads of `quotes.access_token` in `ExtraWorkPendingCard` are tenant-scoped by RLS. Safe to proceed.

---

## Task 1 — caller-supplied `access_token`

**`src/pages/QuoteAcceptance.tsx`** (public route, token in URL)
- In `handleApprove` (~line 157), change the `accept-quote` invoke body to:
  ```ts
  body: { quote_id: quote.id, access_token: token }
  ```
  `token` comes from `useParams()` and is already used to load the quote.

**`supabase/functions/accept-quote/index.ts`** — Mode 1 (`quote_id` branch, ~line 33)
- Read `access_token` from the request body alongside `quote_id`.
- If either is missing/blank → return `400 { success: false, error: "missing_quote_id_or_access_token" }`; do NOT call the RPC.
- Call the 3-arg RPC: `respond_to_quote({ p_quote_id: quote_id, p_accepted: true, p_access_token: access_token })`. No server-side token lookup.
- Keep existing post-RPC quote fetch and downstream side effects (`sendWhatsAppAlert`, `sendDepositPaymentWhatsApp`, invoice generation) unchanged — they run only after the RPC succeeds, so token validation gates them.

## Task 2 — Mode 2 (phone-number fallback)

No callers found (frontend, edge functions, webhooks). **Delete the `customer_mobile_number` branch entirely** from `accept-quote/index.ts`. Trailing branch returns `400 { error: "Missing quote_id or access_token" }`.

## Task 3 — `generate-quote-pdf/index.ts` accept URL

- Ensure `access_token` and `organisation_id` are in the quote select used earlier in the function (add if missing).
- Import `getTenantPublicUrl` from `../_shared/tenantDomain.ts`.
- Replace slug + `quote_number` construction (~lines 554-562) with:
  ```ts
  const acceptUrl = quote.access_token
    ? await getTenantPublicUrl(supabaseUrl, quote.organisation_id, `/quote/${quote.access_token}`)
    : null;
  ```
- Guard the two consumers of `acceptUrl` (PDF footer ~line 566 and WhatsApp body ~line 590) — omit the accept-link line when `acceptUrl` is null.
- Remove the now-unused `orgSlug` lookup.

## ExtraWorkPendingCard wiring (in scope now that RLS is confirmed)

- Add `access_token` to the quote select in `fetchData()` (~line 64) and to the `PendingQuote` type.
- Update the `accept-quote` invoke to send `{ quote_id: pq.id, access_token: pq.access_token }`.

## Verification

- `tsgo` clean.
- Manual: `/quote/:token` Accept → RPC accepts, notifications fire.
- Manual: JobDetail extra-work Accept → same.
- Manual: regenerate one PDF → URL renders and resolves against `/quote/:token`.

## Out of scope

- 2-arg `respond_to_quote` overload stays live until all call sites verified.
- `src/pages/Quotes.tsx:1162` email-link fix (separate task).
