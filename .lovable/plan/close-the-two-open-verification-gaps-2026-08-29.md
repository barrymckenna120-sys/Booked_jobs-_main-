# Close the two open verification gaps

Two items remain before Steps 2–4 can be called fully verified. Step 3 and the rest of Step 4 stay as passed — nothing is re-tested there.

## Gap 1 — Step 2: unsaved typing must survive the update banner

The earlier run only confirmed navigation stayed usable while the "New version available" banner was up. The plan also required proving in-progress form input is not lost.

What will be done:

1. Publish a baseline build (no source changes) so the live tab has a controlling service worker.
2. Open a persistent live tab at the published URL with the managed session restored, wait for service-worker registration.
3. Navigate to a real job detail page (K&N, existing test/scratch job) and type a distinctive sentinel string into a free-text field (job note / notes-for-office), leaving it unsaved.
4. Publish a second build carrying only a throwaway HTML comment marker in `index.html`, so the waiting worker appears and the banner shows.
5. While the banner is visible, without reloading, assert:
   - the sentinel text is still present in the field (read back the live DOM value),
   - the field is still editable (append more text and re-read),
   - no automatic reload happened (page load timestamp unchanged).
6. Screenshot the banner with the typed text visible.
7. Then click Update, confirm the reload happens only on that explicit click, and note plainly that the unsaved text is expected to be gone after the intentional reload (that is correct behaviour — the guarantee is "no surprise data loss", not persistence through a user-requested reload).
8. Remove the marker comment from `index.html` and republish so live matches clean source.

No changes to `vite.config.ts`, service-worker config, or `PWAUpdateBanner.tsx`.

## Gap 2 — Step 4 under a real Dublin Gas login

Step 4 is reported as "passed for K&N, unverified for Dublin Gas" and stays that way until this run happens — no rounding up.

Session sourcing, in order of preference:

1. Look for an existing non-customer DG test/scratch auth user (e.g. the DG engineer test account already used for QA) and attempt to mint a preview session for it. Minting needs the user's approval on the exec call; no real DG customer account is touched, and no password is needed or seen.
2. If no suitable scratch DG auth user exists, report that and state exactly what is needed (either approval for the specific scratch user's UUID, or a throwaway DG login created for QA) rather than testing against a real account.

Once a DG session is available, the run is:

1. Sign in as the DG user in a fresh browser context.
2. DG JobDetail on a completed DG job: normal load, then slow 3G (400ms / 50 KBps), then hung Supabase REST requests to confirm the 15s timeout panel with Retry / Go back, then recovery via Retry.
3. DG ServiceReceipt for the same job: same three conditions.
4. DG Dashboard on slow 3G: confirm shell/greeting/KPIs paint before deferred panels.
5. Screenshots plus console/network notes, reported as pass/fail per check.

If credentials never arrive, Step 4 is reported as "passed for K&N, unverified for Dublin Gas" rather than closed.

## Technical notes

- Live tab work uses Playwright under `/tmp/browser/step2b/`; DG work under `/tmp/browser/step4-dg/`.
- The only project file touched is a temporary `index.html` comment for the second publish, removed and republished afterwards.
- No payment, schema, or business-logic changes.

## Sequencing

Gap 1 runs now (three publishes total: baseline, marked, clean). Gap 2 runs in a later turn once DG credentials are in hand.
