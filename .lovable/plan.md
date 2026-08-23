# BJ-0064 fix — parts notification recipients, exact before/after

One migration redefining `public.notify_on_parts_request_change()`. No schema changes, no trigger rewiring (it already runs `AFTER INSERT OR UPDATE`).

## Your three questions first

### 1. Which IS NULL guards are dropped (Gap 4)

Only guards inside **Branch 2** (status/notes update). Five places, all the same condition `NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL`:

- the `IF` wrapping the `v_job_engineer` lookup
- the `IF` wrapping the `v_assigned_auth` lookup
- the early `RETURN NULL` that combines them
- the three `CASE WHEN ... THEN <uid> END` arms in the recipient union

Example — the job-engineer lookup:

```sql
-- BEFORE
IF NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
   AND NEW.service_call_id IS NOT NULL THEN
  SELECT e.auth_user_id INTO v_job_engineer
  FROM public.service_calls sc
  JOIN public.engineers e ON e.id = sc.assigned_engineer_id
  WHERE sc.id = NEW.service_call_id LIMIT 1;
END IF;

-- AFTER
IF NEW.service_call_id IS NOT NULL THEN
  SELECT e.auth_user_id INTO v_job_engineer
  FROM public.service_calls sc
  JOIN public.engineers e ON e.id = sc.assigned_engineer_id
  WHERE sc.id = NEW.service_call_id LIMIT 1;
END IF;
```

And the union arm:

```sql
-- BEFORE
UNION SELECT CASE WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
                  THEN v_job_engineer END AS uid
-- AFTER
UNION SELECT v_job_engineer AS uid
```

Net effect: the linked job's assigned engineer is always a recipient, additionally to `engineer_id` / `assigned_engineer_id`, instead of only when both are NULL. `SELECT DISTINCT` already dedupes when they are the same person.

### 2. Exact current NULL-`auth.uid()` behaviour in **this** trigger

It differs per branch — the parts trigger is not uniform, and Branch 2 is the opposite of the `service_calls` pattern:

| Branch | Current NULL-uid behaviour | Code responsible |
| --- | --- | --- |
| 0 — INSERT | Notifies **everyone** in the recipient set (nobody excluded) | `WHERE (auth.uid() IS NULL OR auth_user_id <> auth.uid())` |
| 1 — Cancelled | Notifies **everyone** in the recipient set | same predicate |
| 2 — status/notes update | Notifies **no one at all**, returns before resolving recipients | `IF auth.uid() IS NULL THEN RETURN NULL; END IF;` |

So a webhook or service-role move to "Ordered" fires zero notifications today. That is Gap 5, and it lives only in Branch 2.

### 3. Actor exclusion for authenticated actors

Unchanged. Every recipient query keeps `<> auth.uid()`; an authenticated actor still never notifies themselves. The only edit is that Branch 2 stops bailing out when `auth.uid()` is NULL, and its exclusion becomes NULL-safe in the same shape Branches 0 and 1 already use:

```sql
-- BEFORE (Branch 2)
WHERE uid IS NOT NULL AND uid <> auth.uid()
-- AFTER
WHERE uid IS NOT NULL AND (auth.uid() IS NULL OR uid <> auth.uid())
```

## Before/after for all 5 gaps

### Gap 1 — INSERT also notifies the job's assigned engineer

Branch 0 keeps its office fan-out unchanged, and gains a second insert after it, sent only when the linked job has an assigned engineer who isn't the actor:

```sql
-- AFTER (new, appended before RETURN NULL in the INSERT branch)
IF NEW.service_call_id IS NOT NULL THEN
  SELECT e.auth_user_id INTO v_job_engineer
  FROM public.service_calls sc
  JOIN public.engineers e ON e.id = sc.assigned_engineer_id
  WHERE sc.id = NEW.service_call_id LIMIT 1;

  IF v_job_engineer IS NOT NULL
     AND (auth.uid() IS NULL OR v_job_engineer <> auth.uid()) THEN
    INSERT INTO public.notifications (...)
    VALUES (v_job_engineer, 'parts_requested', 'Part Being Sourced',
            NEW.description || ' · ' || v_customer_name || ' · ' || v_job_ref
              || ' · being sourced for your job',
            NEW.service_call_id, 'engineer', jsonb_build_object(...), NEW.organisation_id);
  END IF;
END IF;
```

Engineer-logged requests self-exclude via `<> auth.uid()`, so an engineer who logs their own part gets nothing extra.

### Gap 2 — cancellation reaches the requester + ops account

```sql
-- BEFORE (Branch 1 recipient set)
SELECT auth_user_id FROM (
  <engineers office roles>  UNION  <profiles office roles>
) r WHERE (auth.uid() IS NULL OR auth_user_id <> auth.uid())

-- AFTER
SELECT DISTINCT auth_user_id FROM (
  <engineers office roles>
  UNION <profiles office roles>
  UNION SELECT user_id FROM public.profiles
         WHERE receives_ops_notifications = true AND user_id IS NOT NULL
  UNION SELECT NEW.logged_by            WHERE NEW.logged_by IS NOT NULL
  UNION SELECT NEW.engineer_id          WHERE NEW.engineer_id IS NOT NULL
  UNION SELECT NEW.assigned_engineer_id WHERE NEW.assigned_engineer_id IS NOT NULL
) r WHERE auth_user_id IS NOT NULL
    AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
```

Engineer recipients get `role = 'engineer'`; office recipients keep `role = 'office'` (the row's role is derived per recipient so the engineer app's role filter still shows it).

### Gap 3 — engineer-driven status changes notify the office

```sql
-- BEFORE (Branch 2 actor gate)
v_actor_role := public.get_user_role(auth.uid());
IF v_actor_role NOT IN ('admin','office','owner','manager','superadmin') THEN
  RETURN NULL;   -- engineer changes die here
END IF;
```

```sql
-- AFTER — no bail-out; the actor's role picks the audience
v_actor_role := COALESCE(public.get_user_role(auth.uid()), 'office');  -- NULL uid = automation, treat as office

IF v_actor_role IN ('admin','office','owner','manager','superadmin') THEN
  -- notify engineers (recipient set below, Gap 4 applied)
ELSE
  -- notify the office fan-out (same union as Branch 0), type 'parts_update', role 'office'
END IF;
```

### Gap 4 — see question 1 above (five `IS NULL` guards dropped in Branch 2)

### Gap 5 — automated changes still notify

```sql
-- BEFORE (top of Branch 2)
IF auth.uid() IS NULL THEN
  RETURN NULL;
END IF;
```

```sql
-- AFTER — removed entirely; NULL uid falls through as an 'office' actor
-- and every recipient predicate becomes NULL-safe:
--   WHERE uid IS NOT NULL AND (auth.uid() IS NULL OR uid <> auth.uid())
```

## Verification

- Scratch job with a distinct assigned engineer, using scratch data only, cleaned up after.
- INSERT by office -> office rows + exactly one engineer row for the job's engineer.
- Office moves it to Ordered -> engineer notified even with `engineer_id` set (Gap 4).
- Engineer moves it to Ready to Fit -> office notified, engineer not self-notified (Gap 3).
- `UPDATE` run as service role (no `auth.uid()`) -> notifications fire (Gap 5).
- Cancellation -> office + ops + requesting engineer (Gap 2).
- Confirm no authenticated actor ever appears as their own recipient.
- Delete all scratch rows and their notifications, then confirm zero remain.
