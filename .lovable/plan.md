# Confirmed indicator — one badge, everywhere relevant

Customers can confirm a 2-day appointment reminder two ways: by replying CONFIRM on WhatsApp (automated) or by telling the office, who logs it manually. Today neither shows anywhere in the app. This adds a single shared badge and makes both paths write the same field so the badge can't under-report.

## Scope note

This writes appointment-confirmation state onto jobs, so it is not a pure UI change. The resolver that decides *which* job a manual confirmation belongs to gets unit tests before it is wired in.

## 1. Shared badge component

New `src/components/jobs/JobConfirmedBadge.tsx`.

- Renders `CheckCircle2` + "Confirmed" using the cyan pair already used for the renewal `confirmed` stage (`RenewalCard.tsx`, `dashboard/RenewalsCard.tsx`): text `#0891B2` on `#CFFAFE`.
- Props: `confirmed`, `confirmedAt`, and a `size` of `sm` (icon-only pill, for dense grids) or `md` (icon + label).
- Renders nothing when `confirmed` is false — no "Not confirmed" state, so quiet screens stay quiet.
- `title` attribute shows "Confirmed on DD/MM/YYYY" from `confirmed_at`, parsed with the `T12:00:00` convention so the date can't drift.

## 2. Apply it to every relevant surface

All four surfaces already fetch jobs with `select("*")`, so `confirmed` and `confirmed_at` arrive with no query changes.

| Surface | File | Placement |
| --- | --- | --- |
| Schedule week grid | `src/components/schedule/WeeklyGrid.tsx` | `sm` badge on the job block, next to the existing status badge |
| Schedule job drawer | `src/components/schedule/JobSlotDrawer.tsx` | `md` badge in the header beside the status |
| Job detail | `src/pages/JobDetail.tsx` | `md` badge in the header next to the status badge |
| Jobs list | `src/pages/Jobs.tsx` | `sm` badge on the job card |
| Pipeline > Incoming | `src/pages/IncomingJobs.tsx` | `sm` badge on the card |

Pipeline's Incoming tab mostly holds jobs that aren't booked yet, so the badge will rarely appear there — it's included so a job that does get confirmed looks the same on every screen.

## 3. Make the manual path write the same field

`src/components/whatsapp/LogReplyModal.tsx` currently only sets `customers.last_reminder_response = 'Confirmed'`. It will also mark the job confirmed.

`whatsapp_messages` has no job link, so the job has to be resolved from the customer using the same rules the automated path already uses. New `src/lib/confirmReplyTarget.ts` mirrors `_shared/cancelIntent.ts`: eligible jobs are that customer's jobs with status `Booked` or `Scheduled`, `scheduled_date` today or later, and `reminder_2day_sent = true`.

Outcomes when staff pick "Confirmed":

- **Exactly one eligible job** — set `confirmed = true` and `confirmed_at = now()`, write a `customer_activity` entry "Appointment confirmed — logged by office", toast "Reply saved · appointment marked confirmed".
- **No eligible job** — save the reply as it does today, change nothing on any job, and toast that no upcoming appointment was found to mark.
- **Two or more eligible jobs** — never guess. Save the reply and toast asking staff to confirm on the specific job. Same refusal-to-guess rule as the automated path.

The existing reply and opt-out behaviour is untouched.

## 4. Tests

- Unit tests for `confirmReplyTarget.ts`: no eligible job, exactly one, two or more, past dates excluded, jobs without `reminder_2day_sent` excluded, wrong statuses excluded.
- Manual check: badge on a confirmed job across all five surfaces, absent on an unconfirmed one, and a manual "Confirmed" log producing the badge.

## Known gap left open

The badge reads job-level `confirmed`. Confirmations logged against a customer who has no reminded upcoming job still won't produce a badge — correct behaviour, but worth knowing it's a deliberate blank rather than a bug.
