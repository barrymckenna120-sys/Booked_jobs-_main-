# Restore New Leads on KN Gas Services Ltd mobile Pipeline

## Confirmed current state
- A fresh 390×844 mobile session for **K&N gas services Ltd** shows **Incoming → Leads → Quotes → Renewals**; opening Leads displays five tenant-scoped enquiries.
- The tenant account is active, has profile role `admin`, engineer role `owner`, and office access enabled. Its role data should not hide Leads.
- The current source and published KN domain both contain the corrected Leads gate. Pipeline has no viewport-specific condition that can hide only this tab.
- The mobile installed app uses a service worker that can continue running an older cached bundle until an update activates. The affected physical phone’s active bundle/cache version has not yet been observed, so this remains the leading diagnosis rather than a claimed root cause.

## Plan
1. **Reproduce the affected installed-app state**
   - Compare the affected phone’s home-screen app with Safari on the same phone and the current published KN domain.
   - Capture whether the update prompt appears and whether reopening/refreshing changes the tab set.
   - Confirm the active app-shell version before changing code.

2. **Apply only the confirmed smallest fix**
   - If the phone is stale, adjust only the existing app-update activation path so a safe cold launch adopts the current build reliably, without changing unsaved-work protection during an active session.
   - If the phone is current, stop and trace the returned role state on that session; change the Pipeline gate only if evidence shows a remaining mismatch.
   - Keep the fix to 1–2 files and add one focused regression test for the confirmed failure.

3. **Verify the complete flow**
   - On mobile sizes, confirm Pipeline navigation, Leads tab visibility, opening the page, and tenant-scoped lead rows.
   - Check loading, empty, and failed-request presentation.
   - Confirm desktop Pipeline is unchanged.
   - Confirm a restricted engineer still cannot access office data and another tenant cannot read KN Gas Services Ltd leads.
   - Run the focused regression test, relevant test suite, TypeScript check, and production build.

## Safety boundaries
- No database writes, permission changes, RLS changes, tenant-ID hardcoding, dependencies, or unrelated PWA/navigation refactors.
- Do not change source merely to mask an unconfirmed stale-device diagnosis.
