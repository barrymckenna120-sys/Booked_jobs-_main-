# Office → Engineer direct message: bell / sound / banner fix

## What changes (2 commits, single concern)

1. **Migration:** replace `notify_on_job_message` so a direct message (`job_id IS NULL`) from a
   non-engineer to an engineer creates one notification row. All of the following must hold, otherwise
   the trigger does nothing:
   - `NEW.organisation_id IS NOT NULL`
   - the sender belongs to that organisation (`profiles.user_id = NEW.sender_id AND organisation_id = NEW.organisation_id`)
   - the recipient is an **active engineer in that same organisation** (`engineers.auth_user_id = NEW.recipient_id`)
   - the recipient is not the sender
   Notification: `notification_type = 'message'`, `role = 'engineer'`, `job_id = NULL`,
   title `"<Sender> (Office) sent you a message"` (same format as job messages, no job part),
   body = first 100 characters, same metadata keys with null job fields, `ON CONFLICT DO NOTHING`.
   The job-message path is unchanged, byte-for-byte. Engineer → office direct messages are not changed.
2. **`src/components/messages/DirectMessageThread.tsx`:** remove the broken client-side
   `notifications` insert (wrong columns `user_id`/`type`) so the trigger is the only source.
   No other UI changes.

No Engineer App code changes: the bell count, `MessageAlertBanner` (beep + banner; "View Job" already
hidden when there is no job) and push already react to `notification_type = 'message'` rows with
`role = 'engineer'`.

## Commit 1 — migration SQL (applied exactly as written; on error, stop and paste it)

```sql
CREATE OR REPLACE FUNCTION public.notify_on_job_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient RECORD;
  v_org_id uuid;
  v_job_ref text;
  v_assigned_engineer_id uuid;
  v_assigned_auth_id uuid;
  v_assigned_status text;
  v_customer_id uuid;
  v_customer_name text;
  v_sender_name text;
  v_role_label text;
  v_title text;
  v_metadata jsonb;
BEGIN
  -- ===== Direct message (no job): notify the named engineer recipient =====
  IF NEW.job_id IS NULL THEN
    IF NEW.organisation_id IS NULL
       OR NEW.recipient_id IS NULL
       OR NEW.sender_role = 'engineer'
       OR NEW.recipient_id = NEW.sender_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.profiles
         WHERE user_id = NEW.sender_id
           AND organisation_id = NEW.organisation_id
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.engineers
         WHERE auth_user_id = NEW.recipient_id
           AND organisation_id = NEW.organisation_id
           AND status = 'active'
       ) THEN
      RETURN NEW;
    END IF;

    SELECT display_name INTO v_sender_name
    FROM public.profiles
    WHERE user_id = NEW.sender_id
      AND organisation_id = NEW.organisation_id
    LIMIT 1;

    v_sender_name := NULLIF(TRIM(COALESCE(v_sender_name, '')), '');
    v_sender_name := COALESCE(v_sender_name, 'Office');

    -- "Nicole (Office) sent you a message" (no job part on direct messages)
    v_title := v_sender_name || ' (Office) sent you a message';

    v_metadata := jsonb_build_object(
      'message_id', NEW.id,
      'conversation_id', NULL,
      'sender_id', NEW.sender_id,
      'sender_name', v_sender_name,
      'sender_role', NEW.sender_role,
      'job_id', NULL,
      'job_reference', NULL,
      'customer_id', NULL,
      'customer_name', NULL,
      'organisation_id', NEW.organisation_id
    );

    INSERT INTO public.notifications (
      organisation_id, recipient_user_id, notification_type,
      title, body, job_id, role, metadata, is_read, created_at
    ) VALUES (
      NEW.organisation_id, NEW.recipient_id, 'message',
      v_title, LEFT(NEW.message, 100), NULL, 'engineer',
      v_metadata, false, now()
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
  END IF;

  SELECT sc.organisation_id, sc.job_reference, sc.assigned_engineer_id, sc.customer_id, c.name
    INTO v_org_id, v_job_ref, v_assigned_engineer_id, v_customer_id, v_customer_name
  FROM public.service_calls sc
  LEFT JOIN public.customers c ON c.id = sc.customer_id
  WHERE sc.id = NEW.job_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sender display name always resolved from the message author (NEW.sender_id),
  -- never from the assigned engineer, job owner, recipient or customer.
  IF NEW.sender_role = 'engineer' THEN
    v_role_label := 'Engineer';
    SELECT name INTO v_sender_name
    FROM public.engineers
    WHERE auth_user_id = NEW.sender_id
      AND organisation_id = v_org_id
    LIMIT 1;
  ELSE
    v_role_label := 'Office';
    SELECT display_name INTO v_sender_name
    FROM public.profiles
    WHERE user_id = NEW.sender_id
      AND organisation_id = v_org_id
    LIMIT 1;
  END IF;

  v_sender_name := NULLIF(TRIM(COALESCE(v_sender_name, '')), '');
  v_sender_name := COALESCE(v_sender_name, v_role_label);

  v_customer_name := NULLIF(TRIM(COALESCE(v_customer_name, '')), '');
  v_job_ref := NULLIF(TRIM(COALESCE(v_job_ref, '')), '');

  -- "John Smith (Engineer) sent you a message — Job DG-100"
  v_title := v_sender_name || ' (' || v_role_label || ') sent you a message';
  IF v_job_ref IS NOT NULL THEN
    v_title := v_title || ' — Job ' || v_job_ref;
  END IF;

  v_metadata := jsonb_build_object(
    'message_id', NEW.id,
    'conversation_id', NEW.job_id,
    'sender_id', NEW.sender_id,
    'sender_name', v_sender_name,
    'sender_role', NEW.sender_role,
    'job_id', NEW.job_id,
    'job_reference', v_job_ref,
    'customer_id', v_customer_id,
    'customer_name', v_customer_name,
    'organisation_id', v_org_id
  );

  IF NEW.sender_role = 'engineer' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id
      FROM public.engineers
      WHERE organisation_id = v_org_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND auth_user_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications (
        organisation_id, recipient_user_id, notification_type,
        title, body, job_id, role, metadata, is_read, created_at
      ) VALUES (
        v_org_id, v_recipient.auth_user_id, 'message',
        v_title, LEFT(NEW.message, 100), NEW.job_id, 'office',
        v_metadata, false, now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    IF v_assigned_engineer_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT auth_user_id, status
      INTO v_assigned_auth_id, v_assigned_status
    FROM public.engineers
    WHERE id = v_assigned_engineer_id
      AND organisation_id = v_org_id
    LIMIT 1;

    IF v_assigned_auth_id IS NULL
       OR v_assigned_auth_id = NEW.sender_id
       OR v_assigned_status <> 'active' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
      organisation_id, recipient_user_id, notification_type,
      title, body, job_id, role, metadata, is_read, created_at
    ) VALUES (
      v_org_id, v_assigned_auth_id, 'message',
      v_title, LEFT(NEW.message, 100), NEW.job_id, 'engineer',
      v_metadata, false, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
```

## Commit 2 — frontend

Remove the broken client-side `notifications` insert block from
`src/components/messages/DirectMessageThread.tsx`. No other lines change.

## Verification

- Rolled-back SQL simulation (transaction rolled back after counting):
  - office direct message to Karl → exactly 1 notification row (correct recipient, organisation, role, title)
  - job message → 1 notification row (unchanged path)
  - sender's organisation differs from `NEW.organisation_id` → 0 rows
  - `recipient_id = sender_id` → 0 rows
  - inactive engineer recipient → 0 rows
  - sender with no profile in the organisation → 0 rows
- Log in as Karl at 390px while an office user (Nicole/Mary/Barry) sends a direct message:
  bell badge +1, banner and sound once, nothing duplicated. Screenshots.
- Background/PWA push only as far as browser permissions allow; preview hosts don't register push
  tokens (BJ-NEW-U), so real push must be checked on Karl's phone.
- RLS on `notifications` and `job_messages` unchanged; confirm another tenant/user cannot read the row.
- Full Vitest suite, typecheck, build.

## Known data caveat

The 26/09/26 17:38 UTC direct message row has `sender_id = recipient_id = Karl's auth user id`,
so under the "not the sender" rule it produces 0 notifications even after the fix. A test send must
come from Nicole, Mary or Barry.

## Out of scope / risk noted

- Engineer → office job messages created 0 notifications (office recipients come from
  `engineers.role`). Separate bug, reported only.
- The migration is live as soon as it is applied — no Edge Function deploy, no rollback beyond
  re-applying the previous function definition (preserved in git history / migration file).
