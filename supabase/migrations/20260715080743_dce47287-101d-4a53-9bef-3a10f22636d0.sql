-- Collapse message_log to a single organisation_id column.
-- 1. Remove the K&N default landmine from the shadow column.
ALTER TABLE public.message_log ALTER COLUMN organisation_id_ref DROP DEFAULT;

-- 2. Backfill organisation_id from the customer where possible (~84 rows).
UPDATE public.message_log m
SET organisation_id = c.organisation_id
FROM public.customers c
WHERE m.customer_id = c.id
  AND m.organisation_id IS NULL
  AND c.organisation_id IS NOT NULL;

-- 3. Delete the 5 unrecoverable orphan rows (no customer, empty/placeholder
--    content, all confirmed as test artefacts from Mar/May 2026).
DELETE FROM public.message_log
WHERE organisation_id IS NULL;

-- 4. Enforce tenant tagging going forward. Any future insert that omits
--    organisation_id will now fail loudly instead of silently defaulting.
ALTER TABLE public.message_log ALTER COLUMN organisation_id SET NOT NULL;

-- 5. Drop the redundant shadow column and its FK.
ALTER TABLE public.message_log DROP COLUMN organisation_id_ref;