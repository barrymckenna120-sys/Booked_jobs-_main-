# Show job photos/videos on the Schedule job card

## What I found (verified)

- `src/components/schedule/` contains only `AssignJobModal`, `JobSlotDrawer`, `UnallocatedJobs`, `WeeklyGrid`. A search for `job_media` / `MediaGallery` / `photos` across all schedule components and `src/pages/Schedule.tsx` returns **zero matches**.
- The `ScheduleJob` type (Schedule.tsx lines 80-113) has no media field, and the schedule query never touches `job_media`.
- So this is a genuine display gap: media only appears in the Pipeline/Job Detail "Photos & Videos" tab (`MediaGallery`) and the engineer app. Nothing on Schedule renders it — not the grid card, not the slot drawer.
- Live KN Gas test data confirmed: job **KN-449** (today, 10 Aug, 9am-11am slot) has **4 media rows**; KN-445, KN-432, KN-438 have 1 each. KN-449 is the verification target.

## What to build

1. **Media count on the schedule card** (`WeeklyGrid.tsx`, both the desktop grid card and the mobile list card): a small camera-icon badge with the count, shown only when the job has media. Same visual language as the existing job-type badge (10px, muted).
2. **Media thumbnails in the slot drawer** (`JobSlotDrawer.tsx`): a "Photos & Videos" section near the bottom (after notes/access notes, before the action buttons) rendering the existing `MediaGallery` component with `jobId={job.id}` and `showUpload={false}` — reusing the same signed-URL/Cloudinary handling as Pipeline, no new media logic.
3. **Counts source**: one lightweight query in `Schedule.tsx` that fetches `job_media` counts for the visible week's job ids, exposed as `media_count` on `ScheduleJob` and passed down to `WeeklyGrid`. Keeps the grid render cheap (no per-card fetching).

## Verification

Load the Schedule page for the current KN Gas week, confirm the KN-449 card in the 9am-11am slot shows a "4" media badge, open its slot drawer and confirm the 4 thumbnails render (video thumbnails included), then check a job with no media shows no badge and no empty section. Done in the live preview with a browser check, not from a screenshot.

## Technical notes

- Reuse `MediaGallery` as-is; do not duplicate `useSignedMediaUrls` or Cloudinary URL logic.
- Counts query is org-scoped implicitly via the already-filtered job ids; no RLS or policy change needed since `job_media` reads already work on Pipeline.
- No backend, schema, or upload-path changes — display only.
