# Read-only audit: TEST K&N (c0aa41ac-41ab-42d8-8085-972c072b0279)

I will run the uploaded brief exactly as written, Steps 0 to 12 plus the final summary table. Nothing is changed: no data, schema, code or storage changes, no deletes, and no delete proposal. The real K&N org (8c37827f…) is read only once, for the phone-overlap count in 11i.

## Order of work
1. **Step 0 guard:** check that the org's name is exactly `K&N gas services Ltd`. If it isn't, stop and report.
2. **Check columns first:** read information_schema for every table used in the brief. I will state the exact column or rule used wherever the brief asks for one: job origin, the quote-to-job link, how SumUp checkouts are matched, the post_payment_messages "pending" rule, and the storage path prefixes.
3. **Run Steps 1–11** in the brief's order. Each step shows its raw SQL and raw output. Ids are shortened to 8 characters, phones to the last 4 digits and emails to the domain only. Dates are DD/MM/YY.
4. **Apply the test flag everywhere it's asked for:** LIKELY TEST, INTERNAL (0873685252) or POSSIBLY REAL, across customers, leads, chats and message recipients.
5. **Step 7 and Step 9d:** read the source of every DELETE trigger function and check whether it can send anything. List every post-payment message that could still send.
6. **Step 12 gaps:** compare the Step 1 counts against the tables covered in Steps 2–11.
7. **Final table** at the top of the report: POSSIBLY REAL records, REAL MONEY rows, pending post-payment messages, and DELETE triggers that can send.

## Technical notes
- Database reads use only the read-only query tool. Storage counts come from `storage.objects` via SELECT.
- Every query is filtered by the target organisation_id, or by joins scoped to it.
- The output will be long. The full raw SQL and output also go into a Files document (`/mnt/documents/audit-test-kn-c0aa41ac.md`), and chat gets the summary table plus the file.
