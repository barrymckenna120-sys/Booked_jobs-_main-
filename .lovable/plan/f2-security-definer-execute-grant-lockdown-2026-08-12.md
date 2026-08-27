# F2: SECURITY DEFINER execute grant lockdown

## Branch check — blocked

Active branch is `edit/edt-5c7a8a84-fa89-4a34-b9a2-501c46e9f30f`, **not `dev`**. Per your instruction I have stopped and made no changes. Approving this plan is your override if you're happy to proceed on the current branch.

## What this does

One new migration file containing your 34-function grant lockdown exactly as written — Bucket A (anon + authenticated), Bucket B (authenticated only), Bucket C (revoked from PUBLIC, anon, authenticated with no replacement grant). No function bodies touched, no statements added, removed, or reordered, no functions outside your list.

Then run your verification query and return the raw rows. Nothing else.

## Three confirmed breakages in Bucket C

These are verified from the codebase, not assumptions. If applied exactly as written, Bucket C will break live functionality:

1. **`next_org_invoice_number(uuid)` is called from the browser.**
   `src/lib/nextInvoiceNumber.ts:11` calls it via `supabase.rpc()` using the authenticated key. Revoking from `authenticated` makes every invoice-number allocation fail (it swallows the error and returns `null`, so this will surface as missing invoice numbers rather than a visible error).

2. **`get_user_role(uuid)` is called by two Edge Functions on a user-scoped client.**
   - `supabase/functions/invite-team-member/index.ts:56` — `supabaseUser.rpc('get_user_role', ...)`
   - `supabase/functions/reset-auth-block/index.ts:61` — `supabaseUser.rpc('get_user_role', ...)`

   Both clients are built with the anon key plus the caller's `Authorization` header, so they execute as `authenticated`. Revoking breaks team invites and the auth-block reset. (Three other call sites — `unblock-user`, `list-users`, `deactivate-user` — use the service-role client and are unaffected.)

3. **`get_cert_pdf(text)` — safe, but worth stating.**
   Its only call site is `src/pages/CertificateViewer.tsx:17`, which is not wired to any route in `App.tsx`. Revoking is correct and breaks nothing today.

Everything else in Bucket C is safe: the 11 trigger functions (`notify_on_*`, `log_job_*`, `handle_new_user`, `sync_job_status_from_parts`, `prevent_*`, `email_queue_wake`) never need `EXECUTE` — triggers run as the table owner. The queue helpers, `is_ignored_number`, `expire_overdue_quotes`, and the impersonation pair are all service-role or cron callers only.

## How to handle the conflicts

Your call — the migration itself is unchanged either way:

- **Option 1 (recommended):** apply as written, then follow immediately with a second migration granting `EXECUTE` on `next_org_invoice_number(uuid)` and `get_user_role(uuid)` back to `authenticated`. Keeps F2 auditable as one clean block.
- **Option 2:** apply as written and accept the breakage, fixing the three call sites to go through service-role Edge Functions instead. Larger change, better end state.
- **Option 3:** apply as written with no follow-up. Invoices, team invites, and auth-block reset will break.

Tell me which and I'll execute. If you say nothing, I'll apply as written and stop for your instruction before any follow-up.

## Technical detail

- Single migration file, statements verbatim in your Bucket A / B / C order.
- Verification query run afterwards via read-only DB access; raw rows returned unsummarised.
- Note `information_schema.routine_privileges` only lists *positive* grants, so Bucket C functions will correctly appear as zero rows in the verification output rather than as an explicit revoke record.
- No tests, no other changes.
