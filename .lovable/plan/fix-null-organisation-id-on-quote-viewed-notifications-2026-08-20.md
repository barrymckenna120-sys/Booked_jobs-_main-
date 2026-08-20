# Fix NULL organisation_id on quote-viewed notifications

## What I confirmed first

- `mark_quote_viewed` does two inserts into `notifications` and neither sets `organisation_id`.
- All three read/write policies on `notifications` require `organisation_id = get_my_org_id()`, so a NULL-org row is unreadable by its recipient — not just missing from the badge.
- There are exactly **18** rows with a NULL organisation, but **17** are quote-viewed rows. The 18th (30 Jul, "Certificate WhatsApp Failed") comes from a different producer — see Finding below.
- Recipients: Dublin Gas owner (8 quote-viewed rows) and a K&N Gas office user (9 rows). Each has exactly one active team record, so the org per row is unambiguous.

## Step 1 — Fix the function

Update `mark_quote_viewed` so both inserts set `organisation_id`, read from the quote itself (`quotes.organisation_id`) — the same source every other notification producer uses (`notify_on_job_change` uses the job's `organisation_id`).

The recipient loop currently selects team members by `engineers.user_id = quote.user_id`, which can pick people outside the quote's org. It will be changed to select by `organisation_id = <quote org>` to match `notify_on_job_change`, so the org stamped on the row always matches the recipient's org.

Nothing else in the function changes: quote status update, titles, bodies, metadata and the `role = 'office'` value all stay as they are.

## Step 2 — Backfill the existing rows

Per row, set the organisation from the recipient's own active team record (not from the quote), so the row is visible to the person it was sent to.

Mapping to be applied:

```text
recipient: Dublin Gas owner   -> Dublin Gas    (8 rows, 02 Jul - 12 Aug)
recipient: K&N office user    -> K&N Gas Services (9 rows, 05 Aug - 19 Aug)
recipient: Dublin Gas owner   -> Dublin Gas    (1 row, cert-failure row, 30 Jul)
```

Worth flagging: two of the Dublin Gas rows point at quotes Q-2026-0098 / Q-2026-0099, which are themselves tagged to the K&N org while being owned by the Dublin Gas owner. Backfilling from the recipient (as instructed) sends those two to Dublin Gas so the recipient can actually see them. The underlying quote mis-tagging is a separate issue and is not touched here.

The cert-failure row is included only so the "0 NULL rows" check can pass; its producer is not being changed in this pass.

## Step 3 — Other insert paths (report only)

Checked all live database functions and Edge Functions that write notifications. One gap found and **not** fixed here:

- `supabase/functions/send-certificate-whatsapp/index.ts` (~line 325) posts a "Certificate WhatsApp Failed" notification without `organisation_id`, and also selects admin recipients by `user_id` rather than org. This is the source of the 18th row.

Everything else (job-change, job-message, video-upload, parts-request triggers, and the shared `notifyAdmin` helper) does set `organisation_id`.

## Verification

- `notifications WHERE organisation_id IS NULL` returns 0 rows.
- Re-run a quote view on a scratch quote and confirm the new notification row carries the correct org, and that the resulting rows are readable under the recipient's own session (badge count reflects them).
- Confirm the older quote-viewed rows now appear in the notifications list for their recipient.
