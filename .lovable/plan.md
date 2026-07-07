## Problem

Two independent regressions in the notification bell/sound path:

1. **DB triggers missing.** `pg_trigger` has no triggers bound to `public.service_calls` or `public.job_media`. The functions `notify_on_job_change`, `notify_on_video_upload`, and `log_job_completed_activity` exist but are never invoked. Combined with today's deletion of client-side notification inserts in `useEngineerJobs.ts` / `EngineerJobDetail.tsx`, engineers no longer receive "New Job Assigned", "Reassigned", "Cancelled" alerts, and the office no longer receives status-change fan-out (En Route, On Site, In Progress, Completed, Payment, No Show, Parts Needed, Follow-up), Tally new-job fan-out, or new-video alerts. Quote-related notifications still work because they are inserted directly by `respond_to_quote` / `mark_quote_viewed`.

2. **Autoplay unlock runs without a user gesture.** `AppLayout.tsx:94` and `EngineerLayout.tsx:59` call `unlockAudio()` inside a mount-time `useEffect`. Browsers require a real user interaction to unlock audio, so first-of-session Realtime chimes are silently dropped until the user clicks something.

## Fix 1 — Re-attach the trigger bindings

One migration that binds the existing functions to the correct tables. No function bodies change.

```sql
DROP TRIGGER IF EXISTS trg_service_calls_notify ON public.service_calls;
CREATE TRIGGER trg_service_calls_notify
AFTER INSERT OR UPDATE ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_change();

DROP TRIGGER IF EXISTS trg_service_calls_log_completed ON public.service_calls;
CREATE TRIGGER trg_service_calls_log_completed
AFTER UPDATE ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.log_job_completed_activity();

DROP TRIGGER IF EXISTS trg_job_media_notify_video ON public.job_media;
CREATE TRIGGER trg_job_media_notify_video
AFTER INSERT ON public.job_media
FOR EACH ROW EXECUTE FUNCTION public.notify_on_video_upload();
```

Not re-attaching `log_job_booked_activity` — its call site was previously explicit and I don't want to change activity-log semantics in this migration. Flag if you want it restored too.

## Fix 2 — Gesture-bind `unlockAudio`

Replace the mount-time call with a one-shot listener on the first user gesture. Do it in one small shared helper and call it from both layouts.

`src/utils/audio.ts` — add:

```ts
export function armAudioUnlockOnFirstGesture() {
  if (typeof window === "undefined") return;
  const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
  const handler = () => {
    unlockAudio();
    events.forEach((e) => window.removeEventListener(e, handler));
  };
  events.forEach((e) => window.addEventListener(e, handler, { once: true, passive: true }));
}
```

In `AppLayout.tsx:94` and `EngineerLayout.tsx:59`, swap:

```ts
useEffect(() => { unlockAudio(); }, []);
```

for:

```ts
useEffect(() => { armAudioUnlockOnFirstGesture(); }, []);
```

`SoundPrompt`'s "Enable sounds" click already plays a chime (a real gesture), so once the user interacts anywhere in the tab, subsequent Realtime chimes will play.

## Out of scope (unchanged)

- `useNotifications.ts` sound-gate logic, Realtime channel, and notification payloads.
- `NotificationBell`, `NotificationBanner`, `NotificationDrawer`, `NotificationToast` — all remain the shared components used by both office and engineer layouts.
- Quote/receipt/booking notification code paths.

## Verification after apply

1. `SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('public.service_calls','public.job_media');` returns the three new triggers.
2. Assign an engineer to a job in office view → engineer's bell increments and (after any click in the tab) chimes.
3. Change a job to `En Route` → other office users' bells increment.
4. Upload a video as engineer → job owner's bell increments.
