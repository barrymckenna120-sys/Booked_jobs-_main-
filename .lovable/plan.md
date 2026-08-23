# BJ-0057 — Manual look-ahead navigation on Today's Jobs

## Goal
Add a client-side look-ahead mode to the engineer Today's Jobs screen. The engineer can preview the next job's full card without changing the actual active job, then return to the current job. Cancelling the Complete sheet also advances the view to the next job.

## Scope
- Client-side React state only.
- Two files: `src/pages/engineer/EngineerToday.tsx` and `src/components/engineer/EngineerJobCard.tsx`.
- One prop change in `src/components/engineer/CompleteSheet.tsx` so its Cancel button can advance the view.
- No writes to `service_calls.status`, no payment logic, no Edge Functions, webhooks, or DB triggers.

## Plan

### 1. EngineerToday.tsx — view state and displayed job
- Add local state: `const [viewedJobRef, setViewedJobRef] = useState<string | null>(null);`
- Keep `getNextJobId(todayActive)` as the source of truth for the actual next job.
- Compute `displayedJob`:
  - If `viewedJobRef` is set and the job still exists in `todayActive`, show that job.
  - Otherwise fall back to the actual next job (`sortedActive[0]`).
- Add `useEffect` that re-validates `viewedJobRef` whenever `todayActive` changes. If the referenced job is no longer active, reset `viewedJobRef` to `null`.
- Compute `nextViewJob`: the job after `displayedJob` in `todayActive` (by time order). If `displayedJob` is the last active job, return `null`.
- Pass to `EngineerJobCard`:
  - `isViewingAhead: boolean` — true when `viewedJobRef` is set and valid.
  - `onAdvanceView: () => void` — sets `viewedJobRef` to `nextViewJob.id`.
  - `onBackView: () => void` — resets `viewedJobRef` to `null`.
  - Keep `isNextJob` unchanged so styling still reflects the actual next job.
- Update the "Today's Jobs" count and `REST OF DAY` list so they continue to reflect `todayActive`, not the look-ahead view.

### 2. EngineerJobCard.tsx — Next Job / Back controls
- Accept new optional props: `isViewingAhead`, `onAdvanceView`, `onBackView`.
- When `isViewingAhead` is true, render a "Back to current job" control at the top of the card (e.g. a subtle button or badge). Clicking it calls `onBackView()`.
- When `isViewingAhead` is false and `onAdvanceView` is provided and there is a next job, render a "Next Job" control on the card. Clicking it calls `onAdvanceView()`.
- Ensure these controls do not conflict with existing card taps or sheet opens. Use `stopProp` where needed.
- The existing `isNextJob` badge and styling remain based on the actual next job.

### 3. CompleteSheet.tsx — Cancel advances the view
- Add optional prop `onAdvanceView?: () => void`.
- Change the Cancel button's `onClick` from `onClose` to:
  ```ts
  () => {
    onClose();
    onAdvanceView?.();
  }
  ```
- This is a view-state-only change: it still closes the sheet and does not write to the DB.

### 4. Verification
- Manual check with a scratch job:
  1. Open Today's Jobs with multiple active jobs.
  2. Confirm the actual next job card is shown and has a "Next Job" control.
  3. Tap "Next Job" — the card switches to the following job, a "Back" control appears, and no DB write occurs.
  4. Tap "Back" — returns to the actual next job.
  5. Open the Complete sheet on the actual next job and press Cancel — sheet closes and view advances to the next job.
  6. Simulate a realtime update that removes the viewed job (e.g. complete it from another session) and confirm the view falls back to the actual next job.
- Confirm no console errors and mobile layout is not broken.

## Risk
Low. Purely additive view state; no data model or backend changes.
