-- Clear Dublin Gas placeholder review URL
UPDATE public.settings
SET google_review_url = NULL
WHERE organisation_id = 'f1950683-e8b9-41cf-8972-2aa59516850d'
  AND google_review_url = 'https://g.page/r/test-placeholder/review';

-- Remove test job DG-409 dependants then the job and test customer
DELETE FROM public.customer_activity WHERE customer_id = '8f4914d1-7a6e-4dc5-8961-2088a6a8ddee';
DELETE FROM public.message_log WHERE customer_id = '8f4914d1-7a6e-4dc5-8961-2088a6a8ddee';
DELETE FROM public.customer_call_notes WHERE customer_id = '8f4914d1-7a6e-4dc5-8961-2088a6a8ddee';
DELETE FROM public.notifications WHERE job_id = 'c05d9abf-a1f6-4ac3-8463-cc562f4ec3d5';
DELETE FROM public.service_call_tags WHERE service_call_id = 'c05d9abf-a1f6-4ac3-8463-cc562f4ec3d5';
DELETE FROM public.job_media WHERE job_id = 'c05d9abf-a1f6-4ac3-8463-cc562f4ec3d5';
DELETE FROM public.job_messages WHERE job_id = 'c05d9abf-a1f6-4ac3-8463-cc562f4ec3d5';
DELETE FROM public.service_calls WHERE id = 'c05d9abf-a1f6-4ac3-8463-cc562f4ec3d5';
DELETE FROM public.customers WHERE id = '8f4914d1-7a6e-4dc5-8961-2088a6a8ddee';