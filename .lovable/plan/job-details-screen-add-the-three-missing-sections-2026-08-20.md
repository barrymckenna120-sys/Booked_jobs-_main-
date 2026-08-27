# Job Details screen — add the three missing sections

## Problem
The engineer Job Details screen (`/engineer/job/:id`) is missing three sections that already exist on the Today-screen job card: Service History, Photos & Videos, and Messages. An engineer who taps through from Today loses access to them.

## What changes
Inside the **Details** tab of the Job Details screen, below the Call Notes block and above the Secondary Actions row, add three sections reusing the exact same components already used on the Today card:

- **Service History** — collapsible list of the customer's previous jobs
- **Photos & Videos** — inline media grid for this job (viewing; the existing "Photo" capture button stays as-is)
- **Messages** — engineer/office message thread for this job

Nothing else on the screen moves: header, Details/Certs tabs, contact buttons, info tiles, banners, Notes, Job Tags, Call Notes reply, Reschedule, Complete/Cancel, Certificates CTA all stay exactly where they are.

## Out of scope
- No changes to payment, completion, invoicing or cancellation logic
- No changes to the Certs tab
- No changes to the Today screen or the job card itself
- No restructuring of the page into the job-card component

## Edge cases
- No previous services: Service History renders its existing empty state
- No media: media grid renders its existing empty state
- Cancelled / completed jobs: sections still render (read-only history and media are useful after the fact)

## Technical notes
- `src/pages/engineer/EngineerJobDetail.tsx` only — one file.
- Import and render the existing components as the card does in `src/components/engineer/EngineerJobCard.tsx:236-239`:
  - `JobServiceHistory` with `jobId` + `customerId`
  - `EngineerMediaGrid` with `jobId`
  - `EngineerJobMessages` with `jobId` + `officeUserId`
- `EngineerJobMessages` needs the office user id. The card resolves it with a query on `organisations.owner_user_id` keyed by `job.organisation_id`, falling back to `job.user_id`. Add the same lookup to the detail page (folded into the existing `fetchJob` parallel query batch rather than a new hook) and use the same fallback.
- Sections are wrapped so they render only once `job` and `customer` are loaded, matching the existing guards.

## Verification
- Screenshot `/engineer/job/:id` for a job that has media, previous services and messages — all three sections visible in the Details tab.
- Screenshot a job with none of the three — empty states render, no layout break.
- Confirm the Certs tab is unchanged and the Reschedule / Complete / Cancel actions still work.
- Typecheck clean, no console errors, 390px mobile viewport check.
