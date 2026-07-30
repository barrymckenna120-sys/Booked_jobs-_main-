## Status of the two already-completed files

`JobCertsTab.tsx` and `EngineerCertificates.tsx` already carry this fix in the live files (verified by reading them; typecheck clean). No further edits needed there — on approval I'll re-print their current state as the diff you asked for, and make the one remaining change below.

## New work: `src/pages/engineer/EngineerJobDetail.tsx`

Current state confirmed by reading the file:
- L88: `useEffect(() => { if (user && id) fetchJob(); }, [user, id])` — no `authLoading` in the guard or deps.
- L103-131: `fetchJob` has no `try/catch`; `setLoading(false)` runs only on the success path.
- L111: the `!jobData` branch toasts and navigates but never clears `loading`.
- All queries (`service_calls`, `customers`, `customer_call_notes`, `certificates`, `service_call_tags`, plus the `engineers` effect at L91) destructure `data` only and ignore `error`.
- L543: `if (authLoading || loading)` renders the spinner; L551: `if (!job || !customer) return null;`.

Changes, mirroring `EngineerCertificates.tsx` exactly:

1. Add `const [error, setError] = useState<string | null>(null);` next to `loading`.
2. Rewrite the load effect: return early while `authLoading`; if resolved with no `user` or no `id`, `setLoading(false)` and stop; otherwise `fetchJob()`. Add `authLoading` to the deps.
3. Wrap the whole `fetchJob` body in `try / catch / finally`, moving `setLoading(false)` into `finally` so the `!jobData` redirect and any throw both clear it.
4. Read the per-query `error` on the job query and on all four `Promise.all` queries. Any error → `setError(message)` and return; the "Job not found" toast + redirect to `/engineer/today` stays reserved for a successful query with no row.
5. Fail soft on the `engineers` side-effect query (L91): read its `error`, `console.error`, don't block the page.
6. Add a `Shell` wrapper (header gradient + Back button, matching the page's existing header) and render two new states inside it, placed after the spinner check at L543 and before `if (!job || !customer) return null;`:
   - `!user` → lock icon, "Your session has expired", "Log in again" button → `/auth`
   - `error` → alert icon, "Couldn't load this job", the error message in muted text, **Try again** button → `fetchJob()`

## Not touched

Action handlers (`updateJob`, complete/payment/cancel/reschedule flows) keep their existing `try` blocks unchanged — this is the load path only. No schema, RLS, edge-function, or cert-flow changes. `EngineerApp.tsx` stays flagged, not fixed.

## Verification

`tsgo --noEmit` after the edit, then print the actual applied content of all three files.
