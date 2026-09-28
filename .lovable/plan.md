# Verify Dublin Gas quote follow-ups (day 3 and day 6)

Check first, and only fix if something is proven wrong. No real customers get messages. Both schedules stay as they are unless you approve a change.

## Step 1: Check the setup (read only)
- Schedules: read the `quote-followup-day3` and `quote-followup-day6` cron rows (schedule, active, how each one authenticates). Workspace notes say these were broken before because `current_setting` returned NULL. Confirm whether that is still true.
- Real runs: read the last 14 days of edge_function_logs and message_log for `quote_followup_day3/day6`, split by organisation.
- Dublin Gas quotes: list quotes currently inside the 3–4 day and 6–7 day windows, and whether they are eligible.
- Code: 24-hour selection windows, the `decideFollowup` rules, WhatsApp key lookup for Dublin Gas, and the flags that stop a second send.

## Step 2: Controlled test (Dublin Gas, QA customers only)
Create six QA quotes on a scratch customer. The phone number comes from you. Set `sent_at` so each quote falls in the right window:
- Q1: 3.5 days old, unread and unapproved → day 3 would send
- Q2: 3.5 days old, viewed → skip (quote_read)
- Q3: 3.5 days old, approved → skip (quote_approved)
- Q4: 6.5 days old, day 3 already sent → day 6 would send
- Q5: 6.5 days old, day 3 not sent → skip (day3_not_sent)
- Q6: 2 days old → not picked up (too early)

First run both functions as dry runs, with no `quote_id`, so the time windows get tested too. Paste the message text: Dublin Gas name and phone, the link on the Dublin Gas domain, no "Karl" or "K&N". Then do one real send each for Q1 and Q4 to your number. Run each again right after to show it doesn't send twice. Read back the flags and the message_log rows.

## Step 3: Tenant isolation
- Show a batch run only sends each quote with its own organisation's key and branding: one K&N QA quote in the window uses K&N branding (dry run only).
- Confirm a call from a user session or without credentials is refused, because the functions only accept the scheduler's credentials.

## Step 4: Fix only if a defect is confirmed
Change 1–3 files at most. Likely candidates: the cron command, if it's broken (a DB change, reviewed on its own), or the selection window. Add one regression test. Run the existing quoteFollowup tests and the typecheck.

## Step 5: Clean up
Mark QA quotes expired, or leave them if you want. Report in your six-section format.

## Needs from you
- A test mobile number for the QA customer.
- Approval for the two real sends in Step 2.
