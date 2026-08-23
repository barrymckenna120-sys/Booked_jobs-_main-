# BJ-0063 — Message notification title + "View Job" navigation

Two separate defects, two separate fixes. They are not the same bug: the title comes from a database trigger, the broken button is frontend routing.

## Fix 1 — Richer title (database trigger only)

`notify_on_job_message()` currently writes `'New Message – ' || job_reference` and never looks up the sender or the customer. Change it to write:

```text
Karl – Mary Byrne (KN-515)
```

Format: `{sender name} – {customer name} ({job reference})`, with graceful degradation when a part is missing (`Sender – Customer`, `Customer (KN-515)`, or the bare job reference as a last resort).

Where each piece comes from, added to the single existing lookup on `service_calls`:
- customer name: join `customers` on `service_calls.customer_id`
- job reference: already fetched
- sender name: `engineers.name` when `sender_role = 'engineer'`, otherwise `profiles.display_name`, falling back to `'Engineer'` / `'Office'`

The message body stays exactly as it is (`LEFT(NEW.message, 100)`). Both branches of the trigger (engineer→office and office→engineer) get the same title format, so the banner reads consistently in both apps.

Existing notifications keep their old titles — new ones only. Say the word if you want history rewritten too.

## Fix 2 — "View Job" button (frontend only, still needed)

Still a live, separate bug. `MessageAlertBanner.tsx` hardcodes the office route:

```ts
if (alert.jobId) navigate(`/jobs/${alert.jobId}`);
```

The banner is mounted in both layouts — office (`AppLayout`) and engineer (`EngineerLayout`) — but `/jobs/:id` only exists inside the office layout. The engineer job route is `/engineer/job/:id`. So when an engineer taps "View Job" it pushes a route their app doesn't serve and nothing usable happens.

Every other notification surface already solves this by taking a `jobPathPrefix` prop (`"/jobs"` from the office layout, `"/engineer/job"` from the engineer layout) and running it through the shared `resolveNotificationTarget` helper. `MessageAlertBanner` is the only one that never got the prop.

Fix: give `MessageAlertBanner` the same `jobPathPrefix` prop, pass it from both layouts, and resolve the target through the existing shared helper instead of the hardcoded string.

## Scope guarantee

No other notification type's title or body changes:
- `notify_on_job_message()` only ever fires on inserts into `job_messages`, and only writes rows with `notification_type = 'message'`. Parts (`notify_on_parts_request_change`), job status (`notify_on_job_change`), quote-viewed (`mark_quote_viewed`), certificate and payment notifications are all separate functions and are not touched.
- Customer-facing WhatsApp/email copy is unaffected — this trigger writes only to the internal `notifications` table.
- Fix 2 touches routing only, and improves the target for every type shown in that banner (which today is `message` only, since the banner filters on `notification_type === "message"`).

## Verification

- Trigger: insert an engineer preset message on a scratch job and read back the notification row to confirm the title renders as `Karl – Mary Byrne (KN-515)`; repeat for an office reply; confirm a missing customer name degrades cleanly.
- Routing: confirm "View Job" lands on `/engineer/job/:id` in the engineer app and `/jobs/:id` in the office app.
- Confirm existing frontend tests (including `notificationTarget.test.ts`) still pass.
