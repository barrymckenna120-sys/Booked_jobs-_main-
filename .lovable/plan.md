# Engineer App Step 3 — show Today's Jobs as one continuous screen

## What you'll see
Step 3 will show one tall picture of the Today screen instead of two separate ones:

```text
[ header: Engineer / Office / bell / three dots ]   <- from the top screenshot
[ counts, In Progress, Today's Jobs, next job card up to Call / WhatsApp / Nav ]
------------- seamless join (no gap, border or corners) -------------
[ En Route / Message Office ]                        <- from the lower screenshot
[ Rest of Day, Outstanding Balances, Needs Attention ]
[ Today / Upcoming / Completed / Chat ]
```

- Only the top has rounded top corners and only the bottom has rounded bottom corners. There's no gap, border or caption between the two parts.
- Both parts are shown at exactly the same width.
- Duplicate parts are hidden:
  - The top screenshot's bottom menu (Today / Upcoming / Completed / Chat) is hidden, because it covers the end of the job card.
  - The lower screenshot's repeated header (Engineer / Office / bell) is hidden.
  - As a result, the header appears once at the top and the menu appears once at the bottom.
- Tapping it opens the same joined screen in the enlarged viewer. You can scroll from the current job down to the bottom menu with no break.
- Both original screenshot files stay untouched and reusable. Step 3's text and the rest of the guide are unchanged.

## Things to flag
- **The screenshot you just sent is already in the guide.** eng 3 v1.png shows exactly the same screen as the lower Today screenshot in Step 3, so I'll keep using that one rather than upload a copy.
- **The two captures don't overlap.** The top one ends just below Call / WhatsApp / Nav. The lower one starts at En Route. A thin strip of the card between them may never have been captured. If the join shows a visible jump there, I'll report it with a screenshot and won't hide it. A fresh single capture would then be the clean fix.
- **The two captures are slightly different widths** (401 vs 412 pixels, and the lower one shows a scrollbar). Scaling both to the same width can make the card edges line up a pixel or two off. I'll check the join closely and adjust the crop, but it may not be perfect.

## Technical details
- `src/help/types.ts`: add an optional `segments` list to `HelpScreenshot`. Each entry has `{ src, cropTop, cropBottom }` in percent of that image. Screenshots with a single image keep working exactly as before.
- `src/components/help/HelpScreenshotView.tsx`: when `segments` is set, stack each part in a box that hides its cropped edges. Round only the outer corners and use no gap between parts. The enlarged viewer shows the same stacked parts in its scrolling area.
- `src/help/guides/engineer.ts` (Step 3 only): replace the two screenshots with one joined screenshot (e01 then e03), keeping the same alt text. The starting crops are e01's bottom menu (about the last 9%) and e03's header (about the top 6%). I'll fine-tune them against the real images.
- `src/help/registry.test.ts`: check that Step 3 has one joined screenshot made of e01 then e03 and that Steps 3–5 still don't repeat any image. Add a small check for the part-stacking logic.
- Check the result: build a preview of the join from the real images to line up the crops, then check the rendered page at 390px and 1280px, including the enlarged viewer.
