# 401 after engineer Card completion (KN-494) — findings

Read-only investigation. No code changed.

## 1. Which function 401'd

The call fired right after completion is `send-whatsapp-receipt`, from the engineer completion hook:

- `src/hooks/useEngineerJobs.ts:569` — `supabase.functions.invoke('send-whatsapp-receipt', { body: { job_id } })`, fire-and-forget, `.catch()` only writes a console warning (no toast, no retry).
- That function, when it does run, internally calls `generate-receipt-pdf` server-to-server with the service-role key (`supabase/functions/send-whatsapp-receipt/index.ts`), which is why a single failed client call kills both the PDF and the WhatsApp send.

Evidence it never reached the function:

- Backend logs for `send-whatsapp-receipt` and `generate-receipt-pdf` show boots only at 11:40:06–11:40:08 (the office KN-496 run) and nothing at 11:38, when KN-494 completed. A 401 rejected at the API gateway never boots the function, which matches.
- KN-494 row: `receipt_number = KN-2026-7584`, `receipt_pdf_url = NULL`, `receipt_sent = false`.
- KN-496 row (office path, same minute window): `receipt_pdf_url` set, `receipt_sent = true`.

The second 401 is most likely the same invoke's underlying request pair (preflight/retry) rather than a second distinct function — the only other receipt call, `generate-receipt-pdf` at `src/pages/ServiceReceipt.tsx:142`, fires only when Download PDF is tapped. This is not yet confirmed and is the first thing to verify.

## 2. Why it 401'd — unconfirmed

Facts:
- Neither `generate-receipt-pdf` nor `send-whatsapp-receipt` has a block in `supabase/config.toml`, so both run on the platform default for `verify_jwt`; both validate nothing in code and rely on the service-role client.
- The same two functions succeeded from the office path two minutes later with the same signed-in user, so a blanket config problem does not explain it on its own.
- The engineer path calls `supabase.functions.invoke` directly and therefore bypasses `src/lib/invokeFunction.ts`, which is the wrapper that detects a 401, refreshes a stale session once, and retries. The office `TakePaymentModal` calls (lines 249, 253, 273) are also raw invokes, so it has the same exposure — it just happened to hold a fresh token.

Leading hypothesis (to be proven, not assumed): a stale/expired cached access token at the moment of completion, rejected at the gateway, with no refresh-and-retry on this path. Alternative to rule out: the platform default for `verify_jwt` on these two unlisted functions.

## 3. Why the receipt still appeared

Nothing server-side produced it. After completion the hook navigates to `/receipt-view/:jobId`, and `src/pages/ServiceReceipt.tsx` builds the receipt entirely client-side from the `service_calls`, `customers` and `settings` rows (`getReceiptData`). The receipt number is written during completion, not by the function. The PDF is produced only by `generate-receipt-pdf`, on demand from Download PDF — and KN-494 still has no `receipt_pdf_url`, so no PDF and no WhatsApp receipt exists for that job.

## 4. Engineer-only or office too?

Both paths call the same functions with raw invokes and no 401 recovery, so both are exposed. Only the engineer run failed in this session; the office run at 11:40 succeeded end to end.

## 5. New, or silently failing before?

Not caused by the B.1–B.3 payment work: those changes are confined to payment field math (`_shared/paymentUpdate.ts` and its call sites) and add no new function invocation or field to the receipt calls. The receipt invoke at `useEngineerJobs.ts:569` predates that work, and because its only failure handling is `console.warn`, any earlier failure would have been invisible — jobs with `receipt_sent = false` and a null `receipt_pdf_url` are the signature.

## Proposed next step (verification only, still no fixes)

1. Query historical `service_calls` for Completed, non-invoice jobs with `receipt_pdf_url IS NULL AND receipt_sent = false` to size how long this has been failing silently.
2. Reproduce on a scratch job in the engineer app and capture the exact failing request and response body for `send-whatsapp-receipt` (gateway 401 message text), to distinguish stale-token from `verify_jwt` default.
3. Confirm whether the second 401 is a retry of the same request or a distinct function.

Once that confirms the cause, the fix is expected to be small: route these calls through `invokeFunction` and surface a real failure state instead of a console warning. No changes until you approve.
