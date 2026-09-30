# Move the lower Today screenshot into Today’s Jobs

## Change
- In **Engineer App → Step 3: Today’s Jobs**, keep the existing top-half Today screenshot first and move the lower Today screenshot (`help-engineer-03-today-lower`) into the second screenshot position.
- Add the supplied explanations for **Rest of Day**, **Outstanding Balances**, **Needs Attention**, and the four bottom-menu items to Step 3, associated with that screenshot.
- Keep the existing job-detail screenshots after it, preserving the remaining screenshot order.
- Remove the lower Today screenshot and its En Route/Message Office interpretation from the Travel step.
- Leave the separate Google Maps screenshot as the only Travel screenshot.

## Scope
- Change only the Engineer App guide data; do not add a step or alter routes, other guides, or shared Help layouts.
- Preserve the screenshot file itself unchanged.

## Verification
- Run the Help guide tests.
- Check Step 3 renders the lower Today screenshot second with the requested explanations.
- Check Travel retains the Google Maps screenshot and no longer includes the lower Today screenshot.
