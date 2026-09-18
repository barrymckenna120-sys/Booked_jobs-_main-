# Stuck-loading on weak signal — investigation findings (no fixes)

Read-only. Nothing was changed.

## 1. Is the 15-second session timeout still in place?

Yes, intact and not regressed. The session restore, the wake-from-background
session check and sign-out are all time-bounded, and the regression test that
covers a session restore that never answers is still present and passing.
So the screen is not stuck waiting on the sign-in check.

## 2. What a 15-second auth timeout cannot catch

Three startup steps run *after* the session is known and none of them has any
time limit or error state. Any one of them can leave "Loading..." on screen
indefinitely, which matches both phones.

**a. The landing-path decision on the app's own start address — strongest match.**
The installed app always opens at "/", which asks the database "is this person
an engineer or office?" before choosing which screen to send them to. That
question has no time limit, and if it fails, the code clears its "working"
flag but never sets a destination — so the brand loader stays on screen
forever, with no error, no retry and no timeout. This is the only path found
that hangs *permanently by construction* rather than eventually erroring.

**b. Screen code arriving over the network.**
Every screen is downloaded separately on first visit. Only the shell is stored
up front; individual screens are stored the first time they are opened. A
request for a screen that hangs (rather than fails) shows the same "Loading..."
with no limit — the existing one-time reload recovery only triggers on an
outright failure, never on a stall.

**c. Role check on the office shell (bounded, mentioned for completeness).**
This one is time-limited and falls back to the least-privileged role, so it is
not a candidate for a permanent hang.

Android's "No internet connection" banner is Chrome's own hint that requests
are failing at the network level; it confirms the phone had no usable data, and
shows our UI had no bounded state to fall back to.

## 3. Cold start versus returning user

- **Fresh cold start (worst case):** shell and screen code not yet stored, plus
  the untimed landing-path question — both (a) and (b) apply. Permanent hang.
- **Returning user, app already opened once on good signal:** shell and the
  previously visited screens are stored, so the app paints. It then still hits
  the untimed landing-path question at "/", so (a) alone can hang it.
- **Expired sign-in on weak signal:** terminates after the existing limit, but
  resolves as "signed out", so the person is sent to the login screen rather
  than left loading. Separate symptom from the one reported.

Conclusion: the reported failure is almost certainly (a), with (b) making a
never-before-used screen equally vulnerable. Both are compatible with the
identical behaviour on iPhone and Android, since neither is browser-specific.

## Suggested next steps (for your decision, not started)

1. Put a time limit and a visible retry on the landing-path decision, with a
   safe default destination when it cannot be answered.
2. Give the "Loading..." screen a hard ceiling: after a set wait, show a
   "Connection problem — Retry" state instead of spinning.
3. Only then consider storing the engineer screens up front so first use on
   weak signal does not depend on the network.

Each would be a separate, independently reviewable change.
