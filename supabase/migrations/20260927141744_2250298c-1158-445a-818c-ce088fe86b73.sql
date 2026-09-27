DELETE FROM public.customers
 WHERE id = '2ddbe849-f71e-40b9-afac-d907584c5f11'
   AND organisation_id = 'c0aa41ac-41ab-42d8-8085-972c072b0279'
   AND name ILIKE 'RESTORETEST'
RETURNING id, name, organisation_id, created_at;