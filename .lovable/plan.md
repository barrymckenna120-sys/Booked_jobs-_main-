# BJ-0079 — Today's Jobs: stale client, look-ahead index, time-block vocabulary

Three sequenced steps. Each is independently shippable; do not bundle.

## Step 1 — Confirm the stale client (no code change)

The published build already contains the correct one-full-card render (verified in the live
`EngineerToday` chunk: `REST OF DAY`, `PAID — NEEDS COMPLETION`, single `EngineerJobCard`).
Karl's four-full-cards screen matches a build older than 20 Aug, before the compact-row split.

Action: Karl opens the app with the cache bypassed (`?sw=off`, or force-quit the PWA and reopen).
Expected on his current data: one full card (KN-516), one compact row (KN-513), and three rows
under PAID — NEEDS COMPLETION (KN-514, KN-498, KN-491).

Gate: only proceed to Step 2 once he confirms what he sees. If he still sees four full cards on a
cache-busted load, stop and re-audit — the diagnosis is wrong and Steps 2/3 are not the fix.

## Step 2 — Fix the look-ahead index bug (`EngineerToday.tsx` only)

Today the card shown comes from `sortedActive` but "Next Job" is computed against `todayActive`:

```text
displayedIndex = todayActive.findIndex(displayedJob)
nextViewJob    = todayActive[displayedIndex + 1]
```

Whenever the current job is not `todayActive[0]`, the button skips jobs; when it is the last entry
in `todayActive`, `onAdvanceView` is undefined and the button vanishes.

Change: index against `sortedActive` — the same array that drives the visible order — so
"Next Job" always advances to the row shown immediately below the card, and the button is present
whenever a following row exists. The back button and the "previewed job left the list" reset stay
as they are.

Verification: screenshots stepping through a 3-job day (card → Next Job → Next Job → back), plus
confirmation the button is absent on the last job.

## Step 3 — Wire the tested time-block normaliser into Today (separate step)

`useEngineerJobs.ts` recognises only six literal `time_block` strings. Live data is mostly outside
that set, so those jobs get sort weight 99 (pushed to the end of the day) and can never be matched
by `getNextJobId()` block-for-block — it silently falls back to "first job in the list".

Actual distribution in `service_calls`:

```text
2pm–5pm   104   recognised
8am–11am   99   NOT recognised
9am–11am   93   recognised
9am-11am   63   NOT recognised (hyphen)
11am–1pm   31   recognised
11am–2pm   24   NOT recognised
8am-11am   22   NOT recognised
Morning    14   NOT recognised
2pm-5pm     8   NOT recognised (hyphen)
plus a long tail of one-offs, including one row holding a UUID
```

Change: replace `TIME_ORDER` / `TIME_RANGES` with `src/lib/timeBlock.ts` (the 33-test normaliser
already used by `EngineerUpcoming.tsx`) for both `sortByTime` and `getNextJobId`. Unparseable
values keep sorting last, exactly as now. No data is rewritten — this is read-side normalisation
only.

Verification: unit tests over the real distribution above (correct ordering for 8am/11am/2pm and
hyphen variants, unparseable values last), then a before/after screenshot of Karl's day showing
8am–11am first instead of last.

## Out of scope

- Cleaning up the malformed `time_block` values in the database (including the UUID row) — that is
  a data write and gets its own isolated, review-gated step if wanted.
- BJ-0077 Today-screen status whitelist, still accepted as deferred.
