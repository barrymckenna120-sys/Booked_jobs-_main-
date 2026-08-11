# Confirmed indicator — one badge, everywhere relevant

## Pre-build verification (done, not assumed)

Checked directly against the live database and the inbound handler source:

- `information_schema.columns` confirms both columns exist on `service_calls` today: `confirmed` (boolean, NOT NULL, default `false`) and `confirmed_at` (timestamptz, nullable). Not inferred from `select("*")`.
- Real data exists: KN-463 is `confirmed = true`, `confirmed_at = 2026-08-11 14:06:13+00`, `reminder_2day_sent = true` — written by the live CONFIRM reply.
- The automated WhatsApp CONFIRM handler (`supabase/functions/whatsapp-inbound/index.ts`) writes **exactly these two columns**: `{ confirmed: true, confirmed_at: now() }` on the single resolved job, plus an acknowledgment reply and a `customer_activity` row. It does not write a different or unstructured field, so there is no backend gap to fix — the only gap is that nothing in the frontend reads them, and that the manual office path writes `customers.last_reminder_response` instead.

## 1. Shared badge component

`src/components/jobs/JobConfirmedBadge.tsx`

- `CheckCircle2` + "Confirmed" in the cyan pair already used for the renewal `confirmed` stage: text `#0891B2` on `#CFFAFE`.
- Props: `confirmed`, `confirmedAt`, `size` of `sm` (icon-only pill for dense grids) or `md` (icon + label).
- Renders nothing when `confirmed` is false — no "Not confirmed" state.
- `title` shows "Confirmed on DD/MM/YYYY" from `confirmed_at`, parsed with the `T12:00:00` convention.

## 2. Apply it to every relevant surface

| Surface | File | Placement |
| --- | --- | --- |
| Schedule week grid | `src/components/schedule/WeeklyGrid.tsx` | `sm` badge on the job block, beside the status badge |
| Schedule job drawer | `src/components/schedule/JobSlotDrawer.tsx` | `md` badge in the header |
| Job detail | `src/pages/JobDetail.tsx` | `md` badge next to the status badge |
| Jobs list | `src/pages/Jobs.tsx` | `sm` badge on the job card |
| Pipeline > Incoming | `src/components/incoming/IncomingJobCard.tsx` | `sm` badge on the card |

`Schedule.tsx` maps rows manually into `ScheduleJob`, so `confirmed`/`confirmed_at` are added to that type and mapping.

## 3. Make the manual path write the same columns

`src/components/whatsapp/LogReplyModal.tsx` today only sets `customers.last_reminder_response = 'Confirmed'`. It will also mark the job confirmed, using the same columns as the automated path.

`whatsapp_messages` has no job link, so the job is resolved from the customer. `src/lib/confirmReplyTarget.ts` mirrors `_shared/cancelIntent.ts`: eligible jobs are that customer's jobs with status `Booked` or `Scheduled`, `scheduled_date` today or later, and `reminder_2day_sent = true`.

- **Exactly one eligible job** — set `confirmed = true`, `confirmed_at = now()`, write a `customer_activity` entry "Appointment confirmed — logged by office", toast "Reply saved · appointment marked confirmed".
- **No eligible job** — save the reply as today, change nothing, toast that no upcoming appointment was found.
- **Two or more** — never guess. Save the reply, toast asking staff to confirm on the specific job.

Existing reply and opt-out behaviour untouched.

## 4. Tests

- Unit tests for `confirmReplyTarget.ts`: none eligible, exactly one, two or more, past dates excluded, missing `reminder_2day_sent` excluded, wrong statuses excluded.
- Manual check: badge present on a confirmed job across all five surfaces (verifiable against KN-463), absent on an unconfirmed one.

## Known gaps left open

- Manual confirmations for a customer with no reminded upcoming job produce no badge — deliberate.
- Nothing resets `confirmed` when a job is rescheduled, so a confirmed-then-moved job keeps the badge. Can be added on request.
