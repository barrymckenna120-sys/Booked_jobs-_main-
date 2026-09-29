# Undo footer rebuild — WhatsApp footer = trading name only

Scope: undo the footer rebuild only. Nothing else changes.

## 1. Code (one commit)
- `src/lib/messageFooter.ts`: delete `rebuildMessageFooter`. `buildContactSyncPatch({ phone?: string | null })` returns only `{ company_phone }`: the trimmed phone, or null if blank.
- `src/components/settings/GeneralTab.tsx`: change only the call, to `buildContactSyncPatch({ phone: form.business_phone })`.
- `src/pages/admin/TenantDetail.tsx` (~line 421): change the lookup back to `.select("id")`, still filtered by organisation_id. Call `buildContactSyncPatch({ phone: settingsForm.phone })`.
- Tests: remove the footer tests and keep the company_phone tests. Add one test that the returned object has no `message_footer` key.
- Also add this task to roadmap.md.

## 2. Data (two separate steps, each gated on your review)
1. Run the SELECT exactly as written for real K&N and TEST K&N, and paste the output. **Then stop and wait for your go-ahead.**
2. After you approve, run the UPDATE exactly as written, with RETURNING. It must return exactly 2 rows. Paste the output. No other orgs or columns change.

## 3. Evidence
- The commit hash on origin/dev, if I can check it. If I can't, I'll report the working-branch hash and say so.
- Focused test count, full suite count and the typecheck result.
- TEST K&N (c0aa41ac) only:
  - Send one booking confirmation on a scratch job to a reserved test number. Paste the footer line from `message_log`. It must read exactly "K&N Gas Services".
  - Generate one receipt PDF and one quote PDF. Confirm the header reads "K&N Gas Services Limited" using the PDF text or a screenshot.
- Nothing is sent or generated on real K&N.
