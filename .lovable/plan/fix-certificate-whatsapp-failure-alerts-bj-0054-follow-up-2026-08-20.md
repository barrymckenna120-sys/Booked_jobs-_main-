# Fix certificate WhatsApp failure alerts (BJ-0054 follow-up)

When a certificate fails to send over WhatsApp, the alert it creates is not tagged with the business it belongs to, and the list of office/admin people who receive it is picked from the job's creator rather than from the business. That means the alert can be invisible under access rules, and in theory reach the wrong tenant's staff.

## What changes

- Tag the failure alert with the correct business, using the organisation already resolved earlier in the same function (certificate's org, falling back to the job's org — this value is already required and validated before any send happens).
- Select office/admin recipients by business membership instead of by the job creator's id, matching the fix already applied to quote-viewed alerts.
- Keep the job's own user as a recipient so the person who triggered the send still gets notified.

## What does not change

- WhatsApp send logic, message body, footer/template resolution, error handling, and the conditions under which a failure alert fires all stay exactly as they are.

## Backfill

Already verified: there are currently zero alerts missing a business tag, including the one previously found from this function. No backfill needed.

## Verification

- Confirm zero alerts remain untagged after the change.
- Force a certificate WhatsApp failure on a scratch job with a test number (never a real customer), and confirm the resulting alert carries the right business and only reaches that business's office/admin users.
- Confirm the send path itself behaves identically (same response shape, same error log entry).

## Technical notes

- File: `supabase/functions/send-certificate-whatsapp/index.ts`, failure branch around lines 311-338.
- Insert gains `organisation_id: orgId`.
- Recipient query changes from `engineers?user_id=eq.${userId}&role=in.(admin,office)` to `engineers?organisation_id=eq.${orgId}&role=in.(admin,office)&auth_user_id=not.is.null&select=auth_user_id`, keeping the `active` scoping convention used elsewhere if present on that table.
- No migration required.
