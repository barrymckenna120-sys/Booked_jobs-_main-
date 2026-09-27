# Read-only audit: test company "K&N gas services Ltd" (c0aa41ac…)

This is an audit only. Nothing was changed and no delete steps are proposed. Approving this does nothing.

## 1. Tables with organisation_id (row counts for c0aa41ac)

| Table | Rows | Table | Rows |
|---|---|---|---|
| audit_log | 36 | job_payments | 8 |
| auth_activity_events | 14 | job_tags | 0 |
| backup_run_tenants | 2 | message_log | 119 |
| boiler_brands | 41 | notifications | 77 |
| boiler_enquiries | 0 | org_price_list | 0 |
| booking_intake_claims | 9 | parts_request_comments | 0 |
| booking_links | 5 | parts_requests | 3 |
| brand_settings | 1 | payment_checkout_attempts | 7 |
| categories | 2 | products | 2 |
| cert2_certificates | 0 | profiles | 1 |
| certificates | 1 | quotes | 10 |
| communication_deliveries | 28 | service_calls | 25 |
| communication_delivery_attempts | 31 | settings | 1 |
| conversations | 0 | sumup_webhook_events | 2 |
| customer_activity | 78 | support_reports | 0 |
| customers | 9 | tenant_activity_log | 0 |
| debug_logs | 41 | tenant_integrations | 8 |
| edge_function_logs | 0 | tenant_restores | 4 |
| engineer_performance_notes | 0 | transactions | 0 |
| engineers | 1 | whatsapp_messages | 36 |
| fault_draft_test_orgs | 1 | whatsapp_templates | 0 |
| fault_draft_testers | 1 | gdpr_erasures | 0 |
| hazard_notifications | 0 | import_runs | 1 |
| invoices | 0 | job_engineers | 0 |
| job_media | 19 | job_messages | 6 |

## 2. Child tables without organisation_id (counted through their link)

| Child table | Linked through | Rows |
|---|---|---|
| quote_line_items | quotes | 10 |
| invoice_line_items | invoices | 0 |
| service_call_tags | service_calls | 1 |
| customer_call_notes | customers | 0 |
| engineer_blocks | engineers | 0 |
| engineer_working_days | engineers | 0 |

## 3. ON DELETE rules (links between these tables)

| Link | Rule |
|---|---|
| service_calls.customer_id -> customers | CASCADE |
| quotes.customer_id -> customers / quotes.job_id -> service_calls | CASCADE / CASCADE |
| quotes.converted_job_id -> service_calls | NO ACTION |
| service_calls.quote_id -> quotes | NO ACTION |
| service_calls.assigned_engineer_id -> engineers | NO ACTION |
| service_calls.matched_job_id -> service_calls | SET NULL |
| job_payments.customer_id / .service_call_id | RESTRICT / RESTRICT |
| job_payments.reverses_payment_id -> job_payments | NO ACTION |
| invoices.customer_id / job_id / quote_id | NO ACTION (all) |
| certificates.customer_id / job_id | NO ACTION / NO ACTION |
| cert2_certificates.service_call_id / engineer_id | CASCADE / NO ACTION |
| customer_activity.customer_id / service_call_id / created_by(profiles) | NO ACTION (all) |
| message_log.customer_id -> customers | NO ACTION |
| whatsapp_messages.customer_id / linked_quote_id | CASCADE / NO ACTION |
| job_media.customer_id / job_id / boiler_enquiry_id | CASCADE (all) |
| job_messages.job_id | CASCADE |
| job_engineers.job_id / engineer_id | CASCADE / CASCADE |
| notifications.job_id | SET NULL |
| hazard_notifications.customer_id / job_id | SET NULL / SET NULL |
| boiler_enquiries.customer_id | SET NULL |
| quotes.boiler_enquiry_id | SET NULL |
| parts_requests.customer_id / assigned_to(engineers) / profile links | NO ACTION |
| parts_requests.service_call_id | SET NULL |
| parts_request_comments.parts_request_id | CASCADE |
| payment_checkout_attempts.service_call_id | NO ACTION |
| sumup_webhook_events.service_call_id | NO ACTION |
| transactions.service_call_id | NO ACTION |
| quote_line_items.quote_id / product_id | CASCADE / SET NULL |
| invoice_line_items.invoice_id | CASCADE |
| service_call_tags.service_call_id / tag_id / added_by | CASCADE / CASCADE / NO ACTION |
| customer_call_notes.customer_id / service_call_id | CASCADE / SET NULL |
| engineer_blocks, engineer_working_days, engineer_performance_notes -> engineers | CASCADE |
| communication_delivery_attempts.delivery_id | CASCADE |
| backup_run_tenants.backup_run_id | CASCADE |
| organisation_id -> organisations | NO ACTION on most; CASCADE on categories, products, job_tags, whatsapp_templates, backup_run_tenants, gdpr_erasures, tenant_activity_log, fault_draft_*; RESTRICT on tenant_restores |

## 4. Users

| Record | Role | Email domain | Belongs to another organisation? |
|---|---|---|---|
| Login profile (1) | admin | @bookedjobs.ie (same login as the engineer row) | No |
| Engineer record (1) | owner | @bookedjobs.ie | No |

## 5. Phone overlap with real companies

7 of the 9 customers have a phone number (last 9 digits) that also belongs to a customer in real K&N (8c37827f) or Dublin Gas.

## 6. Photos

19 job_media rows, all stored on Cloudinary in the `tally-uploads` folder. None are in the backend's own file storage.

## 7. Numbering

| Number | Where it comes from | Shared with real K&N? |
|---|---|---|
| Job numbers (KN-001 to KN-025 here) | Computed when a job is created: highest existing number for this organisation + 1, using the organisation's prefix | Separate count, but same "KN" prefix, so both companies have their own KN-001, KN-002... |
| Invoice numbers | Computed: highest INV-YYYY-NNNN on this organisation's jobs + 1 | Separate count. This company has 0 invoice numbers. |
| Receipt numbers (KN-2026-xxxx) | Made in the app using the settings "KN" prefix + year + a **random** 4-digit number. No counter at all. | Not a counter; both companies use "KN", so matching receipt numbers are possible. 5 jobs here have one. |

## 8. Payments

8 job_payments rows: 4 card and 2 cash (entered by hand, no transaction id), and 2 SumUp that came from SumUp's own notification and **do have a real SumUp transaction id and checkout id**. There are also 2 matching sumup_webhook_events rows.

## Things to note before any clear-out
- The 41 boiler_brands rows and 8 tenant_integrations rows are setup, not test activity.
- The 2 real SumUp payments are protected (RESTRICT) and block deleting their customer or job.
- The 7 shared phone numbers point to real people's numbers being used in test data.
