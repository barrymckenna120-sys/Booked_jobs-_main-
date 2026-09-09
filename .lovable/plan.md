# Two iPhone bugs: photo upload error, and no way back from Maps

Both causes are confirmed from the code and the live database rules. No code changed yet.

## Bug 1 — "Take Photo" fails with a permission error

Not a camera-permission problem, and not related to yesterday's video work.

The engineer photo screen saves the picture to a file location built from the
engineer's own user id. The storage security rule for job media only allows
saving under a location that starts with the customer, so every photo save is
rejected as "not allowed". Video works because video does not go to that
storage at all — it goes to the external video service (Cloudinary), which the
rule never touches.

Evidence:
- `src/components/engineer/PhotoSheet.tsx:36` builds the path as
  `<user id>/<job id>/<file name>`.
- Live storage rules `job_media_insert_own_org` / `job_media_select_own_org`
  require the second folder segment to be a customer id in the engineer's
  organisation — i.e. `customers/<customer id>/...`.
- The office gallery already uses the correct shape:
  `src/components/media/MediaGallery.tsx:93` → `customers/<customer id>/<job id>/<file>`.
- `src/components/engineer/VideoUploadSheet.tsx:81` stores `cloudinary/<id>` — bypasses the rule.

Fix: change the engineer photo screen to use the same path shape as the office
gallery (`customers/<customer id>/<job id>/<file name>`), and surface the real
error text if a save still fails. Presentation and flow stay as they are; the
security rules are not changed.

Side note found while checking: the same screen writes an empty file type in
some cases and always labels images correctly, so no change needed there.

## Bug 2 — No easy way back after opening Google Maps

The nav button uses `window.open(...)` (`src/components/engineer/job-card/QuickActions.tsx:30`,
plus the same pattern in `src/components/engineer/JobDetailSheet.tsx:184` and
`src/pages/engineer/EngineerJobDetail.tsx:758`). On an iPhone home-screen
install, `window.open` cannot open a new tab, so iOS hands the address to the
Google Maps app and the engineer is dropped out of the app with no back path.

The project already has a safe pattern for this — a temporary link element
clicked with `target="_blank"` (`src/components/customer/PaymentHistory.tsx:70`),
which iOS opens in an in-app browser sheet with a "Done" button that returns
straight to the job.

Fix: add one small shared helper for opening external addresses using that
existing link pattern, and use it for the three nav buttons (and, in the same
pass, the call/WhatsApp buttons in those same engineer files that use
`window.open` too, since they have the identical problem). Destination address
and wording stay exactly as they are.

## Verification

- Take a photo on a Dublin Gas job, confirm it saves and appears for the office.
- Existing photos still display; video upload unchanged.
- Tap Nav on iPhone home-screen install: Maps opens and closing it returns to
  the same job screen.
- Run the type check and full test suite.
