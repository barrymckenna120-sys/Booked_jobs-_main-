## Goal

No screen in the certificate flow should ever sit on a spinner forever. Every failure path ends in either loaded content, an actionable error, or a "sign in again" prompt.

## 1. `src/components/engineer/JobCertsTab.tsx`

- Add an `error: string | null` state alongside `loading`.
- Wrap the `fetchDocs` body in `try / catch / finally`; `setLoading(false)` moves into `finally` so a thrown error can never strand the spinner.
- Read the per-query `error` field on all three calls (`certificates`, `cert2_certificates`, `hazard_notifications`). If any returns an error, set the error state instead of silently rendering the empty state.
- New error UI (replaces the spinner when `error` is set): alert icon, "Couldn't load certificates", the error message in muted text, and a **Try again** button calling `fetchDocs()`.
- Keep the existing "No certificates issued yet" empty state strictly for a successful fetch with zero rows, so a failure never looks like "no data".

## 2. `src/pages/engineer/EngineerCertificates.tsx`

- Same `error` state + `try / catch / finally` treatment on `fetchData`, and read `error` on the `service_calls`, `certificates`, `hazard_notifications`, and `customers` queries.
- Distinguish two cases that currently both redirect or hang:
  - query error → error state with **Try again**
  - query succeeded but no row → keep the existing "Job not found" toast + redirect to `/engineer/today`
- **Session handling.** Today the fetch only runs when `user && id` are both truthy and `loading` starts as `true` — so when `authLoading` finishes with `user === null` (expired token, PWA cold start) the effect never fires and the spinner runs forever. Cover all three outcomes:
  - `authLoading` → keep showing the spinner
  - resolved, no `user` → clear `loading` and render "Your session has expired — please log in again" with a button to `/auth`
  - resolved with `user` → fetch as today
- Same treatment for the two side-effect queries in that effect (`engineers`, `settings`): read their `error` and fail soft — they only populate the header/branding, so log rather than block the page.
- Error and session states render inside the existing page shell (header + back button) so the user is never trapped without navigation.

## 3. Shared behaviour

Both screens: error text comes from the Supabase error where available, with a generic fallback. Retry clears the error first, then re-runs the same fetch function.

## Technical notes

- Supabase-js resolves with `{ data, error }` rather than throwing for most query failures, so the per-query `error` checks are what actually catch RLS denials and bad requests; the `try/catch` is belt-and-braces for network/transport throws inside `Promise.all`.
- No schema, RLS, or edge-function changes. The `gprn` column addition from earlier today is confirmed valid and is not implicated.
- No changes to the certificate flows themselves (`CertificateFlow`, `Cert2Flow`, `Cert3Flow`, `GasInstallationFlow`, `HazardNotificationFlow`).

## Answer to the systemic question — flagged, not fixed

| File | Missing try/catch on fetch | Ignores per-query `error` | Auth-null stuck state |
|---|---|---|---|
| `pages/engineer/EngineerCertificates.tsx` | yes | yes | yes — spinner forever |
| `components/engineer/JobCertsTab.tsx` | yes | yes | n/a (no auth gate) |
| `pages/engineer/EngineerJobDetail.tsx` | `fetchJob` (L103) unguarded; the 9 `try` blocks are all in action handlers, not the load path | yes — destructures `data` only | same `if (user && id)` gate at L88 with `loading` starting `true` |
| `pages/EngineerApp.tsx` | `fetchAll` (L82) unguarded | yes | partly protected: renders on `authLoading` only, so a null user leaves stale/empty lists rather than a spinner |

Systemic rather than one-off — roughly four load paths share it. Worth a follow-up pass extracting a shared fetch wrapper (loading / error / retry / session-expired) instead of patching each screen; this plan deliberately covers only the two files you asked for.
