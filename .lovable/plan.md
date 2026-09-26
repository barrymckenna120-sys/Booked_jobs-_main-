# BJ-NEW-T — KN-021 "Couldn't update this job" after successful card payment (read-only findings)

Nothing was changed: no code, data or migrations.

## 1. Job row
```text
id                    9e69d6eb-477e-4395-9363-ad28bede8f7b
job_reference         KN-021
organisation_id       c0aa41ac-41ab-42d8-8085-972c072b0279  (K&N gas services Ltd)
status                Completed
payment_status        paid
payment_method        card
revenue               150
balance_due           0
paid_at               2026-09-26 17:17:24.37+00
receipt_number        KN-2026-3833
assigned_engineer_id  e482749b-5a46-4789-8132-f530b4e68b1e
updated_at            2026-09-26 17:16:44.390127+00
```
(paid_at is set on the phone, updated_at by the server. The phone clock was about 43s ahead.)

## 2. job_payments
```text
id 5cf0e176-03be-4324-bbf3-0de5ba21aa48 | amount 150.00 | payment_type full | method card
source office_modal | checkout_id null | recorded_by 094b148e-2885-4f03-9dbb-6f64c0cc7469
organisation_id c0aa41ac-... | customer_id bea8b0ec-7b20-463f-ba69-6bbf2c50f5cf
paid_at 2026-09-26 17:17:24.37+00 | created_at 2026-09-26 17:16:41.136821+00
metadata {receipt_number: KN-2026-3833} | reverses_payment_id null | note null
```
There is exactly one ledger row, so nothing was recorded twice.

## 3. debug_logs (all of them)
```text
17:15:11.310 payment_write_success surface=useEngineerJobs patch={status:"En Route"}    before.status=Booked
17:16:26.396 payment_write_success surface=useEngineerJobs patch={status:"On Site"}     before.status=En Route
17:16:31.203 payment_write_success surface=useEngineerJobs patch={status:"In Progress"} before.status=On Site
17:16:42.102 payment_write_blocked surface=useEngineerJobs patch={} ledger=null         before: unpaid, balance 150, In Progress
```
The payment write from the Take Payment screen does not log to debug_logs, so it has no row here. The job row and the ledger row are its evidence.

## 4. Who was logged in
- Auth user `dd10a2f8-cdec-4e43-af7a-35af164b32cc`, email karl@bookedjobs.ie.
- Profile `094b148e-...` (this matches the ledger's recorded_by). Role `admin`, organisation K&N.
- Engineer row `e482749b-...` (Karl Mulligan) has auth_user_id = dd10a2f8. That is the job's assigned_engineer_id.
- I couldn't run `get_engineer_id()` from the read-only tool ("permission denied for function"). The engineers row shows it would return e482749b, the assigned engineer.
- Access rules were not the cause. Karl is an admin in the job's own organisation, so the update rule allows him either way.

## 5. Every path that can write service_calls after an engineer card payment
| Path | Ran? |
|---|---|
| TakePaymentModal.handleGenerate: fresh re-read, then `updateServiceCallRow` (receipt, method, paid_at, paid, Completed), then job_payments insert with source office_modal | Yes, succeeded (server ~17:16:40–44) |
| EngineerJobCard `onPaymentComplete` calls `onUpdate(job.id, {})` ("trigger refresh"), which runs useEngineerJobs.updateJob and then `updateServiceCallRow(jobId, {})` | Yes, blocked at 17:16:42 |
| useEngineerJobs.updateJob completion path (PaymentSheet onDone / onCompleteOnly) | No |
| EngineerJobDetail.updateJob (line 388) and line 705 write | No (no EngineerJobDetail surface in the logs) |
| Offline retry queue (useRetryQueue) | No. It only queues on a transport error, and a blocked write returns before the queue. |
| Receipt screen (send-whatsapp-receipt / PDF) | Edge functions only. They don't show this toast. |

## Answer
- **Succeeded:** the TakePaymentModal write. KN-021 is Completed, paid, €150 card, receipt KN-2026-3833, with one ledger row.
- **Blocked:** the follow-up call `onUpdate(job.id, {})` from EngineerJobCard. It was meant only as a refresh, but it sent an **empty update** through updateServiceCallRow.
- **Why 0 rows:** the update body was empty. When asked to update with no columns, the database interface skips the update and returns no rows, so the "0 rows changed" check treated it as blocked and showed "Couldn't update this job". Access rules, tenant scope and engineer assignment are not involved. The payment itself is correct and complete.

## Suggested fix (separate step, needs your approval)
Single-concern, one file: in `EngineerJobCard.tsx`, replace `onUpdate(job.id, {})` with a real data refresh. Alternatively, have updateJob return early when the patch is empty. Add a regression test to prove an empty patch never reaches updateServiceCallRow.
