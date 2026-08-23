# BJ-0060 amendment — opt-in ops-notification flag instead of role = 'superadmin'

## Problem

The shipped trigger resolves extra recipients from `profiles.role = 'superadmin'`, which matches
three accounts (Linda plus two developer test accounts). All three currently receive every
tenant's office job notifications.

Confirmed on the live function: it references `public.profiles` in 12 places (one per office
recipient loop), and `profiles` has no `receives_ops_notifications` column yet.

## Change — one migration

1. `ALTER TABLE public.profiles ADD COLUMN receives_ops_notifications boolean NOT NULL DEFAULT false;`
2. `UPDATE public.profiles SET receives_ops_notifications = true WHERE user_id = 'ed429061-7b76-4272-af4a-25249ee6d719';`
   (Linda only — everyone else stays false by default.)
3. `CREATE OR REPLACE FUNCTION public.notify_on_job_change()` with all 12 recipient unions changed
   from the role check to:

```text
UNION
SELECT user_id FROM public.profiles
WHERE receives_ops_notifications = true AND user_id IS NOT NULL
```

Everything else in the function is re-emitted byte-identical: branch conditions, titles/bodies,
metadata, `organisation_id` stamping, the outer actor-exclusion
`(auth.uid() IS NULL OR auth_user_id <> auth.uid())`, and the three single-recipient engineer
INSERTs. Column is additive with a safe default, so no client or types changes are required.

## Verification

1. Query `profiles` for every row with `receives_ops_notifications = true` — expect exactly one
   (Linda, `ed429061…`).
2. Confirm the new pattern occurs 12 times in the live function and the old role pattern 0 times.
3. Scratch job in K&N assigned to Karl, flip to En Route through the real engineer path.
4. Confirm `notifications` for that job holds exactly 2 `en_route` rows — Nicole (`574c0743…`)
   and Linda (`ed429061…`) — not 4. Confirm `organisation_id` is stamped on both.
5. Delete the scratch job, customer, notifications and activity rows; re-confirm zero remain.

## Bell/sound sign-in gap

I can mint a preview session for a chosen auth user in this environment and drive the office app
as Linda in a headless browser, so I will attempt the signed-in check: load the office app as
Linda, trigger the En Route change, and capture the bell badge incrementing.

Audio output cannot be captured headlessly — I can only verify the sound code path is reached
(the `playDoubleBeep` branch in `useNotifications`), not hear it. If minting Linda's session is
declined or fails, I will say so explicitly and hand Barry this manual check instead:

1. Sign in to the office app as Linda on a device with sound on and tap once anywhere first
   (browser audio unlock).
2. Have Karl press En Route on the scratch job.
3. Expect the bell badge to increment and a double beep within a second or two, with the banner
   naming the job.

## Note

The flag is opt-in and platform-wide by design: any future operator who should receive all
tenants' ops notifications gets the flag set, with no migration needed.
