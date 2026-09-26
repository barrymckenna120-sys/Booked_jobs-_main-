# BJ-NEW-T fix — empty-patch refresh in useEngineerJobs.updateJob

One file changed + one test file. No Edge Function deploy.

## Change

`src/hooks/useEngineerJobs.ts` — at the very top of `updateJob` (line 271), before the
scroll save and all payment logic:

```diff
   const updateJob = async (jobId: string, patch: Record<string, any>, options?: { jobTagDate?: string | null }) => {
+    // BJ-NEW-T: an empty patch is a caller asking for a refresh (e.g.
+    // EngineerJobCard's onUpdate(job.id, {}) after a payment). Sending it to
+    // updateServiceCallRow updates 0 rows, which the blocked-write guard
+    // reports as "Couldn't update this job" even though nothing failed.
+    // Refresh the list and stop — no write, no toast, no debug log, no queue.
+    if (Object.keys(patch).length === 0) {
+      await fetchAll();
+      return;
+    }
     // debug logging removed — debugLog helper kept for future use
     // Save scroll position before any state changes to prevent iOS jump
     const scrollY = window.scrollY;
```

New regression test `src/hooks/__tests__/useEngineerJobs.emptyPatch.test.ts`: renders the hook
(mocked supabase client, useAuth, toast), calls `updateJob(jobId, {})`, and asserts
`updateServiceCallRow` is never called and the "Couldn't update this job" toast is
never shown. Also asserts a non-empty patch (`{ status: "Completed" }`) still reaches
the write path, so a genuinely refused write still shows the red toast.

## Not changed
EngineerJobCard.tsx, TakePaymentModal.tsx, serviceCallWrite.ts, the blocked-write
check itself, and all payment logic stay untouched.

## Verification
- New regression test passes; full `vitest` suite passes
- `tsgo` typecheck clean
- Commit on the current edit branch (Lovable syncs it to dev automatically; I can't merge manually)

## Technical details
`fetchAll` is already defined above `updateJob` in the same hook (used by the
visibility/online refresh handlers), so the refresh path is the same one the app
already uses. Empty-patch callers (`EngineerJobCard` ~line 463 and ~line 408) keep
working unchanged — they now get the refresh they intended.
