# Two approved fixes

## A. Help navigation overlaps the iPhone status bar (bug)

### What is there today (checked)
- The app viewport already includes `viewport-fit=cover`.
- The shared Help navigation row is a sticky header, with top padding of `env(safe-area-inset-top) + 0.5rem`. That padding is removed on wider screens.
- On your real iPhone the row still sits under the clock, so why it overlaps is **not yet confirmed**. The simulated test could not show it.

### Fix (shared Help layout only)
1. Confirm the cause first. Check what the installed app's status-bar setting does, whether any parent layout adds or cancels the safe-area padding, and whether the wider-screen rule fires on the iPhone.
2. Make the navigation row part of the normal page, so it scrolls away with the page. It will no longer stick to the top.
3. Leave a gap at the top equal to the real iPhone status-bar height, plus normal spacing, wherever that gap is needed. It will not be removed on wider screens unless that is proven safe.
4. Help content, screenshots, guide order and page addresses stay unchanged.

### Checks
- On every guide and every step, `Back to BookedJobs` and `All Guides` are fully visible and tappable at a simulated iPhone safe area of 47px, and they scroll away normally.
- Final pass or fail rests on your real-iPhone check, because the simulator gave a false pass before.

## B. WhatsApp test mode — Stage 1 only (schema and security, nothing sent)

### What is there today (checked)
- Tenant users can read their whole organisation row, and owners can update it. A new column on that row would therefore let owners see the allow-list and change it.

### Design (includes your 10 requirements)
- **Test-mode flag** is a new column on `organisations`: `whatsapp_test_mode boolean NOT NULL`.
  - It is added with a default of false, so existing tenants stay LIVE.
  - The default is then changed to true, so only new tenants start in TEST.
- **Allow-list** is stored in its own superadmin-only table, not as a column on `organisations` (this changes the brief). Otherwise every tenant member could read it.
  - Table `organisation_whatsapp_allowed_numbers`: organisation, number, added at, added by.
  - Each number belongs to one organisation, so being approved on one tenant never counts for another.
  - Access: only the superadmin and the backend service can read or write it. Tenant users have no access.
- **Write protection**: a database trigger on `organisations` rejects any change to `whatsapp_test_mode` unless the caller is superadmin or the backend service.
  - It is enforced in the database, so hiding the setting in the app is not relied on.
  - Other fields owners can edit today are unaffected.
- **Rules for Stage 3's shared check**, written down now:
  - Fail closed: if the tenant, flag, allow-list or cleaned-up number cannot be found, the message is not sent.
  - `suppressed_test_mode` means a deliberate block only. Setup errors and bad input are logged under their own status.
  - A success response is returned only for deliberate blocks.
  - One shared number clean-up is used for both the recipient and the allowed numbers, reusing the existing one.
- Stage 1 changes the database structure only and writes no data.

### Stage 1 checks, then stop
- Read the rows back:
  - Column types and defaults.
  - K&N = false and Dublin Gas = false.
  - A test organisation created inside a rolled-back transaction defaults to true.
- A tenant owner tries to change the flag inside a rolled-back test: expected to be rejected.
- A tenant user tries to read the allow-list: expected to see nothing.
- A superadmin changes the flag inside a rolled-back test: expected to succeed.
- Report the migration, the columns and defaults, the security setup, the K&N, Dublin Gas and new-tenant values, the pass or fail results and the files changed. Then stop for your review before Stage 2.

## Technical notes
- Tests run as the owner and superadmin roles using a simulated login inside the database, and every test is rolled back. No real data changes and no messages are sent.
- AGENTS.md will record why the allow-list is a separate table.
- The roadmap will list the Help iPhone navigation fix and WhatsApp test mode Stages 1 to 6.
