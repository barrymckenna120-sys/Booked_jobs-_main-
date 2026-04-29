## Scope
Three small, surgical edits. Nothing else touched.

---

### 1. `src/pages/IncomingJobs.tsx` — capture and log query errors
In `fetchJobs`, replace:
```ts
const { data } = await query;
```
with:
```ts
const { data, error } = await query;
console.log('[IncomingJobs] data:', data, 'error:', error);
```
No other changes to the function — the existing `data || []` fallback and downstream code remain intact.

---

### 2. `src/pages/Schedule.tsx` — drop `!inner` on customers join
At **line 157**, change:
```ts
.select("*, customers!inner(name, address, phone, email, eircode, area_code, access_notes, boiler_make_model)")
```
to:
```ts
.select("*, customers(name, address, phone, email, eircode, area_code, access_notes, boiler_make_model)")
```
Stops jobs from being silently dropped when the customers row is missing or RLS-restricted — matches the fix already applied to `IncomingJobs.tsx`.

---

### 3. `src/pages/Jobs.tsx` — fix Tally source badge label
The DB stores the source as `"Tally Form"`, but the badge check uses `"Tally"`, so Tally jobs currently fall through to the "Manual" branch.

Two occurrences to update:
- **Line 320:** `j.source === "Tally"` → `j.source === "Tally Form"`
- **Line 437:** `j.source === "Tally"` → `j.source === "Tally Form"`

Badge text/styling stays as-is ("Tally" pill); only the comparison string changes.

---

### Out of scope
- No other error-handling changes beyond the single `console.log`.
- No changes to `IncomingJobs.tsx` realtime subscription, hardcoded `organisation_id`, or any other logic.
- No changes to other files, queries, or styling.
- Pre-existing edge-function build errors in the build log are unrelated to these three files and are not addressed here.