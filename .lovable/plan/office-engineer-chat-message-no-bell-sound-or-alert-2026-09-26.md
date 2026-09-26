# Office → Engineer chat message: no bell, sound or alert

## Root cause (confirmed from data and code)

- Karl's latest office message (26/09/26 17:38 UTC) was saved as a **direct message**: `job_id = NULL`, `recipient_id` = Karl. No notification row was created for it.
- The `notify_on_job_message` database trigger is the only thing that creates chat notifications. Its first line is `IF NEW.job_id IS NULL THEN RETURN NEW;`, so it skips every direct message.
- The Engineer App's bell, sound and on-screen banner all react to new `notifications` rows for the logged-in user. With no row, nothing fires, even though the message itself arrives in chat.
- The two office send screens make it worse:
  - `NewMessageModal` inserts no notification at all.
  - `DirectMessageThread` tries a client-side insert using the wrong column names (`user_id`, `type` instead of `recipient_user_id`, `notification_type`). That insert fails without an error message, and it also breaks the rule that the trigger is the only notification source.

## Fix (2 changes)

1. **One migration: update `notify_on_job_message`.** When `job_id IS NULL` and `sender_role <> 'engineer'` and `recipient_id` is set, insert one notification for the recipient:
   - only if `recipient_id` is an **active engineer in the same organisation** as the message (`engineers.auth_user_id = recipient_id AND organisation_id = NEW.organisation_id AND status = 'active'`) and is not the sender
   - `notification_type = 'message'`, `role = 'engineer'`, `job_id = NULL`, title `"<Sender> (Office) sent you a message"` (same format as today, no job part), body = first 100 characters, and the same metadata keys with null job fields
   - `ON CONFLICT DO NOTHING`
   The job-message path stays exactly as it is now. Engineer → office direct messages are not changed.
2. **`src/components/messages/DirectMessageThread.tsx`:** remove the broken client-side `notifications` insert so the trigger is the only source and a later fix can't cause duplicates. No other UI changes.

No Engineer App code changes are needed. The bell count, `MessageAlertBanner` (beep plus banner; "View Job" is already hidden when there's no job) and push already respond to `notification_type = 'message'` rows with `role = 'engineer'`.

## Verification

- Use a rolled-back SQL simulation to insert an office direct message to Karl. Check that exactly 1 notification row is created with the right recipient, organisation, role and title, and that a job message still creates 1 row.
- Check that a direct message to an engineer in another organisation, or to an inactive engineer, creates 0 rows.
- Log in as Karl at 390px (Engineer App) while an office user sends a direct message. Confirm the bell badge goes up by 1, the banner and sound appear once, and nothing is duplicated. Take screenshots.
- Background/PWA push can only be checked as far as browser permissions allow. Preview hosts don't register push tokens (BJ-NEW-U), so real push has to be checked on Karl's phone.
- Existing RLS on `notifications` and `job_messages` stays the same. Confirm another tenant or user can't read the row.
- Run the full Vitest suite, typecheck and build.

## Out of scope / risk noted

- An engineer → office job message at 17:40 also created 0 notifications. That is probably because office recipients are taken from `engineers.role`. This is a separate bug and is only reported here, not fixed.
- The migration changes the database function directly. It is live as soon as it's applied, with no Edge Function deploy.
