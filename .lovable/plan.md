# Help Centre: approved-guide text import + mobile crops

## Blocker
The completed Customer Import training guide (PDF/DOCX) has not been uploaded yet. The text import (part 2) cannot start until it is. Parts 1 and 3 can be done now.

## 1. Content model (reusable for every future guide)
Extend the guide data so approved guide content maps in without new page code:
- Step: `stepNumber`, `intro`, `instructions[]` (numbered), `tips[]`, `notes[]`, `warnings[]`, optional `quickReference[]`.
- Callouts: `{ number, label, text }` — text only, no PDF positioning. Mobile shows them below the screenshot, desktop beside it.
- Screenshot: optional `mobileCrop` `{ x, y, width, height }` (percent of the same original image). Phone shows the crop; tap to enlarge always opens the full screenshot. Used only where the full image is unreadable at ~390px.
- Guide: `intro`, `sourceDocument` (name + date of the approved guide it came from).
- Generic renderer updated once; no guide-specific pages.

## 2. Customer Import re-import (after the guide is uploaded)
- Replace all 7 steps' text with the approved guide wording (titles, intro, numbered instructions, what to check, duplicate handling, Skip vs Merge, review/confirm, completion, callouts). Only web-readability formatting changes.
- UI labels ("Go to Import Page", "Skip (keep existing)", "Merge new details") stay exactly as in the app.
- Keep the 9 existing clean screenshots; add `mobileCrop` for the wide table steps (column check, errors, duplicates, existing customers).
- Any conflict between the guide and the current app is listed for you, not silently changed.

## 3. Existing guides built from screenshots
Customer Profile and Team & Users text was written from screenshots, which the new rule no longer allows. Mark both "Draft — awaiting approved guide" on their Help page (content stays visible) until their approved guides are uploaded and re-imported the same way. Engineer App stays "Coming soon".

## 4. Visual check before sign-off
In the real preview at ~390px and ~1280px, per Customer Import step: right screenshot, loads, not stretched, crop correct, text readable, tap-to-enlarge opens and closes easily. Evidence: screenshots of each step, both widths. Not marked signed off until you confirm.

## 5. Roadmap
Add: "Login return URL for Help deep links — future, no auth change now". Add re-import tasks for Customer Profile, Team & Users, Engineer App (blocked on approved guides).

## Technical details
- Files: `src/help/types.ts`, `src/components/help/HelpScreenshotView.tsx`, `src/pages/help/HelpStep.tsx`, `src/help/guides/customerImport.ts`, draft flag in `customerProfile.ts`/`teamUsers.ts`, `src/help/registry.test.ts`, `roadmap.md`.
- Crop via CSS `object-position`/scale on the same CDN image — no new image files.
- Tests: crop bounds valid (0–100), callout numbers unique per step, every step has intro or instructions.
- No auth, RLS, route or storage changes.
