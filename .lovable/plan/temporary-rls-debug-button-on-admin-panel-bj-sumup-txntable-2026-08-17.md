# Temporary RLS debug button on Admin panel (BJ-SUMUP-TXNTABLE)

Add a clearly-marked, temporary debug control to the Admin panel so RLS on the new `transactions` table can be verified once, then deleted.

## What gets added

- A new card at the top of the Admin panel's **Tenants** tab titled "Debug: Transactions RLS", visible only on this page (which already blocks anyone who isn't a superadmin).
- One button: **Debug: Test Transactions RLS**. Nothing runs on page load — click only.
- On click it runs, in order, using the currently active logged-in client (so whatever org context is active, real or impersonated, applies):
  1. Read: select all rows from `transactions`
  2. Write: insert `{ organisation_id: '62d6c1c3-99cc-47fa-80ce-ea0e36f0d52b', payment_type: 'pos', amount: 1, status: 'test' }` and return the inserted row
- Results render on-page in two labelled boxes, **Read result** and **Write result**, each showing the raw JSON of both `data` and `error` in a monospace pre block (not console-only).
- A `// TEMP DEBUG — remove after RLS verification, see BJ-SUMUP-TXNTABLE` comment sits directly above the block for easy removal.

No other behaviour, query, table, or page is touched.

## Verification I'll run after building

1. Impersonate K&N, click the button, screenshot both boxes. Expected: Read = empty array, Write = RLS error.
2. Impersonate Cavan Gas, click the button, screenshot both boxes. Expected: Read = the existing test row(s), Write = succeeds.
3. Send both screenshots for sign-off. Removal of the debug button happens in a follow-up once you sign off.

Note: step 2 leaves a real `amount 1 / status test` row in Cavan Gas's `transactions` table. I'll delete that row during the debug-button removal step unless you'd rather keep it.

## Technical details

- File: `src/pages/AdminPanel.tsx` only. Frontend-only change; no migration, no Edge Function, no shared code.
- Uses the existing `supabase` client from `@/integrations/supabase/client` already imported in this file, plus existing `Card`/`Button` imports.
- Local `useState` for `readResult` / `writeResult` / `running`; button disabled while running.
- Errors are stringified via `JSON.stringify(..., null, 2)` so PostgREST RLS messages and codes are fully visible.
