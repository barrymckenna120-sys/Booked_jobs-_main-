# BJ-NEW-Z — Reschedule WhatsApp wording

Two commits, only the files listed in the brief.

## Commit 1 — booking confirmation function + catalogue + tests
Files: `supabase/functions/send-booking-confirmation/index.ts`, `supabase/functions/_shared/whatsappCatalogue.ts`, `src/lib/whatsappCatalogue.generated.ts` (regenerated via `scripts/generate-whatsapp-catalogue.mjs`), plus one new unit test file.

- Read optional `mode` from the body; anything other than `"reschedule"` is treated as `"confirm"`.
- First name: uppercase first character only (`barry` → `Barry`, `McKenna` unchanged). Applies to both modes, including the existing salutation handling and the `"there"` fallback (becomes `There` only if blank name — see question below).
- Confirm text: byte-identical to today apart from the capitalised name.
- Reschedule text:
  ```text
  Hi {firstName}, there's been a change to our schedule and we've had to move your appointment with {companyName || "us"}. Apologies for any inconvenience.

  📅 New date: {Ddd DD/MM/YYYY}
  ⏰ Time: {timeSlot}
  👷 Engineer: {engineerName}

  Does this new time suit? Please reply to this message to confirm, or let us know and we'll find another time.

  {messageFooter, if set}
  ```
  Weekday comes from the same `scheduled_date + "T12:00:00"` date; `"TBC"` when no date (no weekday).
- Reschedule mode only: `message_log.message_type = "reschedule_notification"` (both the send path and the existing replay/decision path at line ~124), activity label `WhatsApp sent — Reschedule`. Delivery `commType` stays `booking_confirmation`. Opt-out skip, delivery tracking and logging otherwise unchanged.
- Catalogue `booking_confirmation` entry documents `mode` and the reschedule wording; generated mirror regenerated.
- Tests: confirm text unchanged, reschedule text exact, `barry` → `Barry`, `McKenna` unchanged. To test without restructuring, the message builder is extracted as a small pure function inside the function folder (still only within the listed function).
- Deploy `send-booking-confirmation` explicitly.

## Commit 2 — callers
- `src/pages/Schedule.tsx` `handleAssign`: pass `mode: "reschedule"` when `oldDate` is set AND (`oldDate.slice(0,10)` ≠ new date OR `oldBlock` ≠ new time block); otherwise send no mode.
- `src/pages/JobDetail.tsx` `handleReschedule`: after a successful update, non-blocking invoke with `{ service_call_id, mode: "reschedule" }`; on failure show the same soft-warning toast pattern as Schedule.
- No other callers or reschedule/schedule functions touched.

## Assumptions (flag if wrong)
- Footer keeps the existing blank-line separator (`\n\n`), same as confirm mode.
- Name fallback `"there"` stays lowercase (capitalisation only applied to a real name), keeping "Hi there".

## Verification / report
Unit test output, full test suite + typecheck, deploy timestamp, both commit hashes and full diff. Commits land on the working branch; I cannot push or confirm `origin/dev` myself. No live WhatsApp sends to real customers.
