# Video playback paths + iPhone fast-navigation freeze

## What the code shows so far

Yesterday's video fix only touched **two** of six places that play video:

| Where video appears | Used by | Fixed today? |
| --- | --- | --- |
| Media sheet (engineer, "Photo/Video" screen) | `MediaSheet.tsx` | Yes — still image tiles, one player only in fullscreen |
| Video send/confirm screen | `VideoUploadSheet.tsx` | Yes — single still frame, 200 MB limit, cancel |
| Photos & Videos list on the job card and job screen | `EngineerMediaGrid.tsx` | **No** — plays a live video in every tile |
| Photos strip on the engineer job card | `JobPhotoThumbnails.tsx` | **No** — live video per thumbnail |
| Old photo screen | `PhotoSheet.tsx` | **No** — live video per thumbnail |
| Office job screen, incoming job review, schedule panel | `MediaGallery.tsx` | **No** — live video per tile, plus one hidden video per item just to read the clip length |

This matches exactly what was seen on the phone: opening a clip from the fixed
screen gives the good player, opening the same clip from the "Photos & Videos"
list on the job goes through the old, unfixed code and flashes black.

Confirmed by file history: the fix commits changed only `MediaSheet`,
`VideoUploadSheet`, `cloudinaryUpload`, `videoPreview` and a test file.

## Desktop

The office job screen has not been edited at all in the video work, so a
desktop change is not yet explained by the diff. Two candidates need to be
watched rather than guessed: the forced MP4 conversion applied to every clip
URL, and the hidden per-clip video elements created only to read the clip
length. Step 1 below reproduces desktop first, then the cause is fixed — no
desktop code is changed before it is reproduced.

## Fast-navigation freeze on iPhone

Likely connected, not a separate bug: the unfixed screens above create a
video decoder per tile and never release it. Moving quickly between pages
leaves those decoders alive, and the hidden clip-length videos are only
cleaned up if their metadata ever arrives — on a weak signal it often does
not. Two already-known deferred items make it worse: the engineer job list
refetches on every return to the app with no throttle, and its retry loop is
unbounded. Step 3 measures this before changing behaviour.

## Plan

**Step 1 — Reproduce desktop, confirm the cause, then fix it**
Open a job with a real clip in the office screen in a browser, capture what
the player actually does (console, network, whether the clip URL returns
video), and identify the exact failure. Fix only what the capture proves.

**Step 2 — Make every screen use one shared video path**
Replace the live per-tile players in the four unfixed screens with the still
poster images already used by the fixed screen, and route every fullscreen
playback through the same single player. Clip length comes from stored data
instead of creating hidden videos. No change to uploading, storage, deleting,
permissions, or who can see what.

**Step 3 — Confirm the freeze and release properly on navigation**
Measure video elements and memory while moving fast between engineer pages,
before and after Step 2. If tiles were the cause, Step 2 resolves it and this
step only verifies. If anything remains, add explicit release when a screen
closes, and revisit the deferred refetch throttle.

**Step 4 — Verify**
Type check, full test suite, and browser checks at phone and desktop widths on
job screens, incoming review, and the schedule panel: tiles show a picture,
fullscreen plays with controls, no console errors. Then a real-device pass on a
scratch job.

## Technical notes

- Shared helpers already exist: `getCloudinaryPosterUrl` for tiles,
  `getCloudinaryVideoUrl` for playback, `videoPreview.ts` for local files.
- `MediaSheet.tsx:35` still holds a dead local poster helper — remove during Step 2.
- `MediaGallery.tsx:46-67` (`useVideoDurations`) is the hidden-decoder leak; `job_media`
  can carry duration instead, or the label can be dropped.
- Files in scope: `EngineerMediaGrid.tsx`, `JobPhotoThumbnails.tsx`, `PhotoSheet.tsx`,
  `MediaGallery.tsx`, plus a small shared viewer component.
- Risk level: medium — `MediaGallery` is shared by three office surfaces; presentation
  only, no data or permission changes.
