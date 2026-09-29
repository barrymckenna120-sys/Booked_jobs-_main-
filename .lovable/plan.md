# Engineer message alerts (with Chat tab)

## Dependency
The engineer chat page (`/engineer/chat`) from your uploaded Chat tab brief does not exist yet. Alert (a) needs it, so the plan builds it first, then the alert fixes. Each part is a separate commit on dev.

## Part 1 — Chat tab and chat page (uploaded brief, unchanged scope)
1. Footer: remove the Office item, add Chat (bottom right) with an unread badge. The header Office switch stays as it is.
2. Badge counts only office messages sent to this engineer (direct messages to them, or messages on jobs assigned to them) that are still unread. It updates live over a single realtime channel.
3. `/engineer/chat` lists conversations newest first: direct threads grouped by office person, and job threads labelled with the job ref and customer name. Each row shows the last message, the time and an unread dot, with empty, loading and error states and 44px tap targets.
4. Opening a job thread reuses the existing job messages view. Direct threads use the existing thread component with a new engineer/office setting; office behaviour stays identical.
5. Database step, isolated and shown before applying: the office gets a notification when an engineer replies to a direct message. This is a new branch only; existing branches are unchanged.

## Part 2 — Alerts (this request)
a. **Tap target.** A direct-message notification (no job) opens `/engineer/chat` with that office person's thread open, using the notification's sender id. Job messages still open the job. Adds a unit test for the direct-message case.
b. **One sound.** Remove the extra beep from the message banner. The main notifications feed keeps the sound, which already respects the sound on/off setting.
c. **One banner.** The general notification banner skips message notifications, so only the message banner shows.
d. **Clearing.** Opening a thread marks its messages read (clears the Chat badge) and marks the matching message notifications read (clears the bell).

## Verification
- Unit tests for the tap target and for the badge/notification-clearing rules; full suite, typecheck and build.
- Live test on the test company at phone width, office account to test engineer only:
  - Office sends one direct message and one job message. For each: bell +1, exactly one banner, exactly one sound (counted from the app's sound log).
  - Tapping the direct banner opens the right thread; tapping the job banner opens the job.
  - Opening a thread clears both the bell and the Chat badge. The engineer's reply shows on the office bell.
- Screenshots: footer with badge, chat list, direct thread. Migration SQL and the commit hashes reported.

## Technical details
- Files: `EngineerLayout.tsx`, new `EngineerChat` page and route, `DirectMessageThread.tsx` (perspective prop), a small unread hook, `notificationTarget.ts` and its test, `MessageAlertBanner.tsx`, `NotificationBanner.tsx`.
- One migration adds a branch to `notify_on_job_message`.
- Not touched: the office inbox, the office badge, push notifications.
- Sound "exactly once" is checked by counting audio calls in the browser, since headless browsers produce no audible sound.
