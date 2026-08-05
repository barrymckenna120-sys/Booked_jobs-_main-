# Email alerts: user deactivation + failed import rows

Two email notifications, both sent through Resend from `noreply@bookedjobs.ie`, matching the existing pattern already used for block notifications and team invites.

## Part 1 — Deactivation email

Fires only after a deactivation has fully succeeded. The existing function already fails closed on unauthorised callers, cross-tenant mismatches, active assigned jobs, and rolls back the auth ban if either the engineer or profile update fails — the email is added after all of that, immediately before the success response, so none of those paths can trigger it.

Email contents: who was deactivated, the organisation, who performed it, and the timestamp.

## Part 2 — Import error email

Fires once per import run whose stored `error_count` is greater than zero. One email per run, never one per errored row.

Email contents: filename, organisation, who ran the import, total rows, error count, and a list of the errored row numbers with their reasons, plus a link to the import page.

## Recipients (both emails)

- Every superadmin, plus the hardcoded platform owner address already used for authorisation checks in these functions.
- Every admin/office user in the affected organisation.

Addresses are resolved server-side and de-duplicated so nobody gets two copies. If nobody resolves to a real address, the send is skipped with a log line rather than failing the operation.

## Technical detail

### New shared helper: `supabase/functions/_shared/notifyOrgAdmins.ts`

- `resolveOrgAdminEmails(supabaseAdmin, organisationId)` — returns a de-duplicated, lowercased address list:
  - `profiles` where `role in ('superadmin')` (any org) and `role in ('admin','office')` scoped to `organisation_id`, filtered to `is_active` where set. `profiles` has no email column, so each `user_id` is resolved through the auth admin API.
  - `engineers` where `organisation_id` matches, `role in ('admin','office','owner')`, `status = 'active'`, and `email` is non-null — this is where office-role staff actually live, since `profiles.role` currently only holds `admin`, `superadmin`, and `engineer`.
  - Plus the platform owner constant already present in `deactivate-user`.
- `sendAdminEmail(subject, html, recipients)` — single Resend POST with the recipients as the `to` array, `from: "BookedJobs <noreply@bookedjobs.ie>"`. Missing `RESEND_API_KEY` logs a warning and returns skipped. Non-OK responses log status plus body.
- Shared `escapeHtml` and a shared card-style HTML shell copied from `send-block-notification`, so both emails look consistent with existing mail.

### `supabase/functions/deactivate-user/index.ts`

- After step 3 (profile update) and before the success response, look up the organisation name, then build and send the email inside a `try`/`catch`. A send failure is logged and swallowed — it must never turn a completed deactivation into an error response or trigger the ban rollback.
- Reuse the already-loaded `engineer.name`, `targetOrgId`, `caller.email`, and a fresh timestamp.

### New function: `supabase/functions/notify-import-errors/index.ts`

- Accepts `{ runId }`, validates the caller's JWT the same way `deactivate-user` does.
- Re-reads the `import_runs` row server-side with the service-role client — the row is the source of truth, so a tampered client body cannot fabricate counts or a different organisation.
- Returns early (no email) when the run is missing, `error_count` is 0, or the caller's org does not match the run's `organisation_id` (superadmin bypasses, matching the existing pattern).
- Resolves the importer's display name from `profiles`, falling back to a dash, and the organisation name from `organisations`.
- Renders the first 20 entries in `row_details` with `outcome = 'failed'`, showing row number and error message, with a "+N more" line when truncated.

### `src/pages/ImportCustomers.tsx`

- Change the existing `import_runs` insert to `.select("id").maybeSingle()` so the new row's id is available (it currently returns nothing).
- When the insert succeeds and `skipped > 0`, invoke `notify-import-errors` with that id. Wrapped so a failed invoke only logs — the import result screen and the audit row are unaffected.
- No change to `buildRow`, duplicate detection, header mapping, or the commit loop.

### `supabase/config.toml`

- Add `verify_jwt = false` for `notify-import-errors` only if the default does not already apply; the function validates the JWT in code either way.

## Note on what `error_count` counts

Ambiguous-phone rows are excluded from `validRows` before the commit loop, so they never reach `row_details` and are not part of `error_count`. This email therefore reports commit-loop failures only — a file blocked entirely by phone conflicts sends no email because no run row is written at all. Flagging it because "import had errors" could reasonably be read as including conflicts; say the word if you want ambiguous rows logged and counted too, and I will fold that in.

## Verification

- Create a disposable test engineer in K&N Gas Services with a real inbox address, deactivate it through the UI, confirm the email arrives with the right names and timestamp, then reactivate/delete the test record and report the actual recipient list resolved.
- For the import email, run a small file crafted to produce at least one commit-loop failure, confirm exactly one email, and confirm the `import_runs` row counts match the email body. Delete the test customers and test run row afterwards.
- Report the real query output and the resolved recipient addresses, not a claim that it passed.
