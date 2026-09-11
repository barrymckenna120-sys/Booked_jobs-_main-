# Photo upload: first attempt failed, retry worked — what the logs show, and what to do

## What I checked

I pulled the backend logs for the window you were testing in (published app, iPhone, today ~19:00–19:10 Irish time):

- Storage: no rejected uploads at all in the last 24 hours — no permission errors, no 4xx/5xx.
- Database: no "row-level security" errors in the last 12 hours.
- Photo records: three saves in that window, all successful, all under the corrected
  `customers/<customer>/<job>/...` location.

So the original permission bug is genuinely fixed, and your failed first attempt never reached
the backend at all. Nothing was rejected — the request didn't complete on the phone side. That
fits your description ("mentioned something about Supabase", first photo after opening the app):
the phone's connection to the backend didn't complete, and the new error message correctly showed
it instead of failing silently.

What I can't prove from the logs is *why* it didn't complete, because a request that never
arrives leaves no server trace, and the exact wording is gone. Since it failed again on a second
fresh app open, treating it as a one-off is not safe — it looks like a real first-attempt pattern,
most likely the app still waking its session up right after launch.

## Plan

### Step 1 — capture the real failure (no behaviour change)

Record the exact failure for the job-card Media photo upload: the error name, message, any HTTP
status, whether the app was online, and whether a signed-in session existed at that moment. Send
it to the existing error monitoring so the next occurrence gives us the precise text and cause
instead of a memory of a flash message. Same treatment for the job-detail photo screen so both
paths report identically.

### Step 2 — make the first attempt survive a waking session

Two small, low-risk changes to the photo upload path only:

- Wait for the session to be ready before the upload starts, rather than firing immediately after
  app launch.
- Retry the upload once automatically on a genuine connection failure (not on a permission or
  validation failure, which must still be shown immediately). If the retry also fails, show the
  real error exactly as it does now.

The engineer then sees "Photo uploaded" on the first tap in the normal case, and still gets an
honest error when something is actually wrong.

### Step 3 — verify

- Confirm from the logs that a fresh-launch first photo now records one successful save with no
  retry needed, and that the reported error detail appears in monitoring when I force a failure.
- Photos still appear for the office; video upload untouched.
- Type check, full test suite, plus a regression test that a permission-type error is never
  retried and is surfaced straight away.

## Technical notes

- Evidence: `storage_logs` shows zero non-2xx responses in 24h; `postgres_logs` shows no
  `objects` RLS violations in 12h; `edge_logs` shows `POST /rest/v1/job_media` → 201 three times
  in the test window.
- Scope: `src/components/engineer/MediaSheet.tsx` and `src/components/engineer/PhotoSheet.tsx`
  only, plus a small shared helper for the classify-and-retry decision.
- No storage policy, schema, RLS, grant or tenant-isolation change. Retry is bounded to one
  attempt and only for transient network/timeout classes, reusing the existing error
  classification approach already used for payment writes.
