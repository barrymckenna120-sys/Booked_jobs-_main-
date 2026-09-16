# Dublin Gas bookings: three separate follow-ups

Confirmed from the data: DG-1023 to DG-1026 were created correctly, sit Pending in Incoming Jobs with no engineer, and carry a `scheduled_date` of 3 and 4 September — dates already in the past when they arrived on 16 September. The submission log shows each arrival had its own submission ID, and repeat deliveries of the same ID were already rejected as duplicates, so the existing guard works; the doubles were distinct submissions.

Each item below is its own reviewed step. Nothing is bundled.

## Step 1 — The past date

Investigate first, then fix. No code change until the cause is named.

1. Capture the raw booking payload. The endpoint currently logs an outcome summary but not the submitted values, so there is no record of what `preferred_day` actually contained. Add the submitted date and time to the existing submission log entry (no customer contact details) so the next real booking is diagnosable.
2. With that evidence, determine whether the date is wrong at the form, wrong in the automation's mapping, or correct and simply a customer picking a past option.
3. Fix based on what step 2 shows. If the incoming date is genuinely in the past, the endpoint should not silently store it as the job date — the candidate behaviour is to keep the job (never drop a customer booking), leave the date unset so it shows as needing scheduling, and record the submitted date in the job notes for the office to see. Confirmed with you before implementing.
4. Tests for a past date, today's date, a future date, and a malformed date.

## Step 2 — One booking creating two jobs

1. Establish which side sends twice: query the submission log for arrival timestamps and IDs across recent bookings, and check whether the pairs differ in content at all.
2. Because the two arrivals carry different submission IDs, the ID-based guard cannot catch them. The existing content-based duplicate check already flagged three of the four, so the strongest safe change is at the point of arrival: reuse the existing duplicate-job lookup inside the booking endpoint and, on a content match inside a short window, log the duplicate and return the original job instead of creating a second one.
3. Threshold and behaviour agreed with you before implementing — rejecting a genuine second booking from the same household would be worse than a duplicate.
4. Tests: same booking twice inside the window collapses to one job; a genuinely different booking from the same customer still creates a job; a repeat of the same submission ID keeps behaving as it does today.

## Step 3 — Make the Schedule honest about these jobs

Presentation only, no query or data changes.

1. A booking whose date sits outside the week being viewed is currently invisible with no hint. Surface a small count on the Schedule for unallocated jobs dated outside the visible week, so nothing looks lost.
2. Make the Unallocated Jobs panel show a job's booked date when that date is in the past, visually marked, so it reads as "needs a new date" rather than as a normal entry.
3. Follow the existing card and badge patterns already used in that panel; no new components and no layout rebuild.
4. Tests for the counting logic, plus a click-through of the Schedule with these four jobs present.

## Order

Step 1 first, since it is the only one that produced a wrong stored value. Step 2 next. Step 3 last, as it only changes what is shown. Each step is reviewed on its own and the four existing DG jobs are left in place as live evidence until you say otherwise.

## Out of scope

- No changes to the booking form or the external automation from here — those are outside the app.
- No changes to tenant resolution, webhook authentication, or scheduling/assignment logic.
- No deletion or editing of DG-1023 to DG-1026 as part of these steps.
