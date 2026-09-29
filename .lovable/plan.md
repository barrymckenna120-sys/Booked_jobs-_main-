# Read-only audit: TEST K&N (c0aa41ac-41ab-42d8-8085-972c072b0279)

This audit only reads data. It makes no data, schema or code changes and runs no deletes. It never touches 8c37827f-ce2c-4507-a821-a5e807d89856.

## Step 0: guard (stop if it fails)
```sql
SELECT id, name, slug FROM organisations WHERE id = 'c0aa41ac-41ab-42d8-8085-972c072b0279';
```
If name is not exactly `K&N gas services Ltd`, stop and report.

## Steps 1-7 (only if the guard passes)
1. **Row counts:** find every public table that has an `organisation_id` column (from information_schema.columns), then count its rows for the target org. No date filter.
2. **Customers:** first 8 characters of id, name, last 4 digits of phone, created date (DD/MM/YY), job count from service_calls, and payment count from job_payments joined via those jobs.
3. **Jobs (service_calls):** job_reference, customer name, job_type, status, scheduled date, created date, and origin. Origin is worked out from existing columns: a Tally/source marker means Tally form, a linked quote (`quotes.converted_to_job_id` or equivalent) means quote conversion, and anything else is manual. Before writing the query I will check the columns and state the exact rule used. Also the sum of job_payments per job.
4. **Payments (job_payments):** job ref, amount, method, type, created date, and whether a real SumUp checkout exists. That means a matching row in payment_checkout_attempts (by service_call_id) and/or sumup_webhook_events for the job.
5. **Boiler enquiries and quotes:** number or submission ID, customer, status and created date for each.
6. **Test flag:** a customer is marked LIKELY TEST if name, email or phone matches `barry`, `test`, `barrymckenna120@gmail.com`, `0872354257` (any format) or `abdenneur1`. Everyone else is POSSIBLY REAL.
7. **DELETE triggers:** read pg_trigger on customers, service_calls, quotes, invoices and job_payments, and keep only triggers that fire on DELETE. For each one, read its function source to check for pg_net, http, send-*, whatsapp, email or push calls, and report whether it can send anything.

## Output
Every query's raw SQL and raw output, shown as-is. PII is shortened (8-character ids, last 4 phone digits). No delete proposal.

## Technical notes
- All queries go through the read-only query tool. Nothing uses psql writes or migrations.
- Every query is filtered by `organisation_id = 'c0aa41ac-…'`, or by joins that are scoped to it.
