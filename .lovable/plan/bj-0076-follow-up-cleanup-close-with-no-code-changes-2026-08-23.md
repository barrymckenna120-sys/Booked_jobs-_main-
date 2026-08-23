# BJ-0076 + follow-up cleanup — close with no code changes

Both queued items resolve to "no work needed". This plan records the outcome so nothing is left dangling.

## BJ-0076 — Follow-ups vs parts: audit only, closed

Confirmed: Follow-ups and parts requests are two independent systems. Follow-up is freetext on the job record (`follow_up_needed`, `follow_up_detail`, `follow_up_resolved`); the real parts lifecycle lives in the parts requests table. The only crossing point is one-directional and cosmetic — the office Parts page borrows the job's follow-up text as default wording for the "part arrived" message, and writes nothing back.

Live overlap is currently zero: of the 10 open follow-ups, 9 have blank detail, and the one that mentions parts (KN-024, flue liner) has no parts request row at all. KN-518 is the reverse — two real parts rows, blank follow-up detail.

Decision: audit only. No link built. Revisit only if Barry reports the disconnect causing real confusion.

## Cleanup request — resolved as "no change needed"

"Close old follow-ups" means using the existing per-item **Mark Resolved** button on the dashboard Follow-ups panel. That control already exists and works. No bulk data write, no new UI, no migration.

Stale list for Barry (open follow-ups, oldest first, all completed jobs):

```text
KN-122   24 Mar 2026   (no detail)
KN-118   24 Mar 2026   (no detail)
KN-123   25 Mar 2026   (no detail)
KN-126   25 Mar 2026   (no detail)  <- carries a stale "urgent" parts stamp
KN-138   26 Mar 2026   (no detail)
KN-142   31 Mar 2026   (no detail)
KN-196   07 Apr 2026   (no detail)
DU-007   07 Jul 2026   (no detail)
KN-518   23 Aug 2026   (no detail, has 2 real parts rows)
KN-024   no completion date — "new flue liner, parts on order from supplier"
```

Eight of these completed over 30 days ago. KN-126's legacy `parts_priority = urgent` stamp is what keeps it pinned to the top of the panel; resolving the follow-up removes it from the list regardless.

## Technical notes

- No files change. No migration. No data write.
- BJ-0075 is already closed: comments realtime publication applied and verified, office Parts foreground/online refetch shipped, and the published bundle confirmed to contain the trail and tracking chunks.
- One cosmetic dead-code observation for a future tidy-up, not actioned here: `FollowUpsPanel.tsx` has an unreachable `return data || []` after the sort return.
