update public.service_calls set scheduled_date = current_date + 5
where id in ('f50d4018-18c6-417c-a797-8918d77ecee1','c699fe57-8aa5-4695-96d2-b8d8ad4914e2');

insert into public.customers (id, user_id, organisation_id, name, phone, address, eircode)
values ('dddddddd-0000-4000-8000-0000000c3c99','574c0743-d9f4-4b7e-a1c5-0c5768cff881','8c37827f-ce2c-4507-a821-a5e807d89856','ZZ KN Scratch Tester','+353892109224','2 Scratch Lane','D02ZZZZ');

insert into public.service_calls (id, user_id, organisation_id, customer_id, job_reference, job_type, status, scheduled_date, time_block, assigned_engineer, follow_up_detail)
values ('dddddddd-0000-4000-8000-0000000e3c99','574c0743-d9f4-4b7e-a1c5-0c5768cff881','8c37827f-ce2c-4507-a821-a5e807d89856','dddddddd-0000-4000-8000-0000000c3c99','ZZ-999902','Boiler Service','Scheduled', current_date + 2, '13:00-16:00','Scratch Engineer','Scratch pump');