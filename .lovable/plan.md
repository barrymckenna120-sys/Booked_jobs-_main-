# BJ-0047 — Show customer WhatsApp history on job detail

## One correction to the brief

Step 2 asks to replace the panel at `JobDetail.tsx:679` because it is "the customer-facing panel". It is not. That panel is the **internal office↔engineer chat**:

```text
<Card> "Messages"
  <JobMessageThread jobId={job.id} perspective="office" />   <- internal thread
  <InlineOfficeReply jobId={job.id} engineerAuthUserId={...} /> <- office replies to engineer
</Card>
```

`JobMessageThread` reads `job_messages`, and its sibling `InlineOfficeReply` is how the office answers the engineer. Its only other usage is `EngineerJobMessages.tsx:81` with `perspective="engineer"` — the same thread from the engineer's side. Replacing it would silently remove office↔engineer messaging from Job Detail and orphan the reply box.

So: the internal panel stays exactly as-is, and the customer WhatsApp history is added as a **second, separate card** below it. Everything else in the brief is unchanged.

Also note the file is `src/pages/JobDetail.tsx`, not `src/components/jobs/JobDetail.tsx`.

## 1. Generalise `WhatsAppHistory.tsx`

Add three optional props, all defaulting to today's behaviour so `CustomerDetail.tsx:838` is untouched:

- `highlightJobId?: string` — rows whose `related_id` matches get a small "This job" badge.
- `hideSendButton?: boolean` — suppresses the built-in "📲 Send Message" button.
- `title?: string` — overrides the "📱 Message History" heading.

`onSendMessage` becomes optional, since JobDetail passes `hideSendButton` and has no send handler to give it.

To badge rows, `related_id` must be carried through the merge — it is currently selected from neither table. Two additions:
- add `related_id` to the `message_log` select and map it onto the unified row;
- `whatsapp_messages` has no `related_id` (its job link is `linked_quote_id` only), so those rows map to `related_id: null` and are never badged.

Because job linkage is stored inconsistently (`related_type` is `service_call` on 384 rows and `job` on 18, both meaning a job), the badge matches on `related_id === highlightJobId` alone and ignores `related_type`. That catches both spellings.

## 2. Add the panel to `JobDetail.tsx`

A new card directly after the existing internal "Messages" card:

```text
<WhatsAppHistory
  customerId={job.customer_id}
  highlightJobId={job.id}
  hideSendButton
  title="Customer Messages"
/>
```

Guarded on `job.customer_id` being present so a job without a customer doesn't render an empty fetch.

## 3. Data logic unchanged

Confirmed the merge/dedupe/sort needs no behavioural change: it fetches both tables in parallel, merges, drops rows with no timestamp, sorts newest-first, dedupes on `id`. The only edit is selecting one extra column. Customer-wide scoping is deliberate (option b) — inbound replies carry no `related_id`, so a strict job filter would hide the customer's actual replies.

## Verification

Screenshot of KN-481 (Fred White, customer `42c3be1d…`) via Playwright against the live preview, signed in as K&N office. Expected in the new card:

- `booking_confirmation` (outbound) — badged "This job"
- `payment_link` (outbound) — badged "This job"
- 2 × `inbound` WhatsApp replies — unbadged
- `reply_unmatched` auto-response — unbadged

Note the two inbound replies and `reply_unmatched` sit at 2026-08-17 10:50, after the sends at 10:29, so newest-first ordering puts the unbadged rows on top; only the first 3 show until "Show older messages" is expanded. I'll expand before capturing so all five are visible.

Also a quick regression click-through of Customer Detail to confirm its Message History card still shows its title and Send Message button.

## Risk

Low. Additive optional props, one extra selected column, one new card. No data-fetch, RLS, or scheduling logic touched.
