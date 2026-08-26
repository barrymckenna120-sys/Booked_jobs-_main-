# Plan: quote-followup-day3 status filter

## Current state
`supabase/functions/quote-followup-day3/index.ts` already uses `.in("status", ["sent", "Sent", "viewed"])` at lines 94-98. The `.eq("status", "sent")` filter described in the request is not present in the current file.

## What this plan will do
1. Confirm no other file changes are needed (the requested single-line change is already in place).
2. Deploy `quote-followup-day3` so the current code is live.
3. Capture and return the deployment log.

## Scope
- Touch only `supabase/functions/quote-followup-day3/index.ts` for deployment.
- Do not modify `quote-followup-day6` or any other file.
- Do not change message wording or any other filter (`approved`, `follow_up_day3_sent`, `sent_at` range).
