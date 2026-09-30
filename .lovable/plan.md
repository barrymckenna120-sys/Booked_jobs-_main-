# Engineer Guide — restructure Steps 3–5 (10 → 11 steps)

## What changes

**Step 3 — Today's Jobs** (text unchanged)
1. Top of Today's Jobs (clean Today screenshot, already here)
2. Lower Today screen: Rest of Day, Outstanding Balances, Needs Attention, bottom tabs. This one moves here from Travel.

**Step 4 — Customer & Job Details** (new step)
- Uses the two job-details screenshots currently at the bottom of Step 3, moved rather than copied:
  - Job details: contact, job type, time slot, boiler information
  - Lower job details: last service, last engineer, notes, service history
- Text uses only the approved wording: "Press Open on the Details button to see the customer, job type, boiler information, last engineer, service history, previous notes and photographs." No other fields are added.

**Step 5 — Travel & Keep the Office Updated** (text unchanged)
- Keeps only the Google Maps screenshot.

The steps after it move down by one. "Step X of 11", Previous/Next, the side list, direct step links and search all follow automatically from the step order. The old page addresses stay the same.

## Please confirm
- Step 3 currently ends with **two** job-details screenshots, the top half and the bottom half. I plan to move both into Step 4. Tell me if you want only the bottom one moved.
- Step 3 still includes the "Press Open on the Details button…" sentence. I plan to keep it there unchanged and reuse the same sentence in Step 4. Tell me if you'd rather it only appear in Step 4.

## Technical details
- `src/help/guides/engineer.ts`: Step 3 screenshots become `[e01, e03]`. Insert a new step with slug `customer-job-details` and screenshots `[e04, e05]`, using the existing alt text. Travel screenshots become `[e08]`. Keywords for the new step: job details, customer, boiler, service history, notes.
- `src/help/registry.test.ts`: add one check that the Engineer guide has 11 steps, with `customer-job-details` in position 4 and no repeated screenshots between Steps 3–5.
- Run the Help tests, then check the three steps at 390px in the browser.
