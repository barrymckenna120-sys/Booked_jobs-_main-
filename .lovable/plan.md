# Help Centre mobile safety and screenshot detail viewer

## Goal
Make every Help screenshot clearly enlargable and readable at its original detail level, while keeping Help navigation and the close control safely below the iPhone status area.

## What should happen
- The Help header begins below the iOS safe area on every guide and step, with comfortable spacing for both navigation controls.
- Every screenshot remains tappable and also gets a clear Lucide-icon **Enlarge image** control instead of subtle instructional text.
- Opening any screenshot launches the same full-screen viewer across all Help guides.
- On iPhone/mobile, users can pinch to zoom and pan in every direction.
- On desktop, users can zoom in, zoom out, and reset/fit the screenshot using fixed controls.
- The close X remains fixed, fully visible, and easy to tap below the safe area; Escape and backdrop dismissal continue to work.
- Full-resolution source images are used. Existing screenshots, guide wording, routes, and step order remain unchanged.

## Implementation
1. Update the shared Help header to use `env(safe-area-inset-top)` plus normal spacing rather than its current fixed-height top placement.
2. Consolidate the duplicated screenshot dialogs into one shared full-screen viewer so ordinary, cropped, marked, and stitched screenshots behave consistently.
3. Use a maintained zoom/pan interaction library for touch pinch, pointer panning, and desktop wheel/control zoom, while keeping controls outside the moving image surface.
4. Render the existing original asset URL in the viewer, constrain only its initial fitted size, and avoid image-quality-reducing transformations or alternate thumbnail sources.
5. Add a visible **Enlarge image** control with a Lucide expand icon; keep the screenshot itself clickable and avoid overlaying important screenshot content.
6. Preserve proportional numbered markers and continuous stitched screenshots while zooming.

## States and safeguards
- Disable zoom-out at the fitted minimum and zoom-in at the supported maximum.
- Reset zoom and pan whenever the viewer closes or a different screenshot opens.
- Keep tall images vertically navigable and prevent the page behind the viewer from moving.
- Preserve keyboard focus, accessible names, Escape close, and a large close target.
- If an image is still loading or fails, the close and viewer controls remain accessible.

## Verification
- Add regression coverage for shared safe-area placement, visible enlarge controls, and viewer reset/control behavior.
- Run the existing Help guide tests to confirm content, routes, order, markers, crops, and stitched images remain intact.
- At **390 × 844**, verify the Help header and X sit below a simulated iPhone safe area; open, close, zoom, reset, and pan a Customer Profile desktop screenshot.
- At **1280px**, verify plus, minus, and fit/reset controls and confirm small Customer Profile fields become legible without blur.
- Check a stitched Engineer Today screenshot and a screenshot with markers to ensure shared viewer behavior does not break either format.
- Confirm no console errors and a clean app build.

## Scope and risk
- **Risk:** Low-to-medium UI change, shared by all Help screenshots.
- **Shared surface:** Help header and image viewer only; no authentication, data, guide content, routes, or business logic changes.
