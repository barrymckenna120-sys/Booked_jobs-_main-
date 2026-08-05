DELETE FROM public.import_runs WHERE filename IN ('caseA.xlsx','caseB.xlsx','caseC.xlsx');
DELETE FROM public.customer_activity WHERE customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'ZZ Sel%');
DELETE FROM public.customers WHERE name LIKE 'ZZ Sel%';