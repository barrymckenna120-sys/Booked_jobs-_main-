# Add the 7 office tour screenshots

All 7 images are now available (5 from the earlier message + Engineer App and Renewals just attached).

## Steps
1. Save images to `public/tour/`: incoming, schedule, engineer-app, quotes, deposit, payment, renewals (`.webp`).
   - Files already WebP: copy as-is.
   - Any PNG (including `enginners_job_screen.PNG` -> engineer-app, `renewals_screen_moblie.PNG` -> renewals): convert to WebP, max 1600px wide, under 150KB. Report each final size.
2. `officeTourSteps.ts`: `hasImage: true` on all 7 steps, paths matching filenames, exact alt text from your brief.
3. Image slot (desktop dialog and mobile sheet): 16:10, `object-fit: contain`, white background, centred — tall phone images (deposit, engineer-app, renewals) shown whole, not cropped or stretched.
4. Step 01 copy: last body sentence -> "Review it and assign it to an engineer."; third benefit -> "Review and assign".

Nothing else changes. No publish.

## Verification
- Test Gas 4 admin only: screenshots of steps 1, 5, 6 at 1440px and step 5 at 390px.
- Build log clean; existing tour tests pass.
- Report commit hash and whether it is on dev.
