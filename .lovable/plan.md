## Status: complete

All three files carry the fix in the live code (verified by re-reading them this turn; `tsgo --noEmit` exit 0 with no diagnostics after the last edit).

### `src/components/engineer/JobCertsTab.tsx`
- `error: string | null` state alongside `loading`.
- `fetchDocs` body wrapped in `try / catch / finally`; `setLoading(false)` in `finally`.
- Per-query `error` read on `certificates`, `cert2_certificates`, `hazard_notifications`; any error sets the error state and returns.
- Error UI: alert icon, "Couldn't load certificates", muted message, **Try again** → `fetchDocs()`.
- "No certificates issued yet" empty state now only reachable after a successful zero-row fetch.

### `src/pages/engineer/EngineerCertificates.tsx`
- Same `error` state + `try / catch / finally`; per-query `error` on `service_calls`, `certificates`, `hazard_notifications`, and the follow-up `customers` query.
- Query error → error state with **Try again**; successful query with no row → existing "Job not found" toast + redirect to `/engineer/today`.
- Session handling: `authLoading` → spinner; resolved with no `user` → `setLoading(false)` and "Your session has expired" + "Log in again" → `/auth`; resolved with `user` → fetch.
- `engineers` and `settings` side-effect queries read their `error` and `console.error` (fail soft).
- Error and session states render inside `Shell` (header + Back).

### `src/pages/engineer/EngineerJobDetail.tsx`
- `error` state; load effect now returns early while `authLoading`, clears `loading` when resolved with no `user`/`id`, and has `authLoading` in its deps.
- `fetchJob` wrapped in `try / catch / finally` with `setLoading(false)` in `finally`, so the "Job not found" redirect and any throw both clear the spinner.
- Per-query `error` on `service_calls` plus all four `Promise.all` queries (`customers`, `customer_call_notes`, `certificates`, `service_call_tags`).
- `engineers` side-effect query fails soft with `console.error`.
- `Shell` wrapper with Back → `/engineer/today`; session-expired state (Key icon) and error state (**Try again** → `fetchJob()`) rendered before `if (!job || !customer) return null`.

## Not touched
Action handlers (`updateJob`, complete/payment/cancel/reschedule) keep their existing `try` blocks. No schema, RLS, edge-function, or cert-flow changes. `src/pages/EngineerApp.tsx` remains flagged, not fixed.

## Remaining manual check
Open a job detail, its Certificates tab, and the standalone certificates route normally, then repeat with a cleared session — all three should show "session expired", never a spinner.
