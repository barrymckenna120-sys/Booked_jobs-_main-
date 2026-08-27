update public.service_calls set scheduled_date = current_date + 2
where id in ('f50d4018-18c6-417c-a797-8918d77ecee1','c699fe57-8aa5-4695-96d2-b8d8ad4914e2');

delete from public.message_log where related_id in ('dddddddd-0000-4000-8000-00000000e3c1','dddddddd-0000-4000-8000-0000000e3c99');
delete from public.customer_activity where service_call_id in ('dddddddd-0000-4000-8000-00000000e3c1','dddddddd-0000-4000-8000-0000000e3c99');
delete from public.service_calls where id in ('dddddddd-0000-4000-8000-00000000e3c1','dddddddd-0000-4000-8000-0000000e3c99');
delete from public.customers where id in ('dddddddd-0000-4000-8000-00000000c3c1','dddddddd-0000-4000-8000-0000000c3c99');
delete from public.tenant_integrations where organisation_id = 'dddddddd-0000-4000-8000-00000000b3c1';
delete from public.organisations where id = 'dddddddd-0000-4000-8000-00000000b3c1';