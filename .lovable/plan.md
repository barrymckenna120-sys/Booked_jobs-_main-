# DATA CLEAR addendum G4–G6: TEST K&N (c0aa41ac) only

## Important: the main DATA CLEAR has already run
The clear ran after the audit and wrote one `tenant_test_data_cleared` audit row. The test org now holds data that was **not there when the clear ran**:
- 5 lead enquiries
- 2 customers
- 5 lead photos

All of these were probably created after 29/09/26 21:20. Under G4/G5 that makes them "possibly real", so the addendum will most likely only list rows and stop. Nothing gets deleted without your approval.

## Steps (nothing is deleted until you approve)
1. **Guard:** confirm the org name is exactly `K&N gas services Ltd` and the org id is c0aa41ac. Never read or write real K&N (8c37827f).
2. **G4, enquiries:** list every row with its id (first 8 characters), contact_name, source, created time (DD/MM/YY HH:MM), linked customer, number of linked quotes and number of photos. Mark each row as BEFORE or AFTER the 29/09/26 21:20 cutoff.
3. **G5, customers:** list every customer with its created time. Also list anything linked to it that was created after the cutoff: jobs, quotes, enquiries, payments, messages or photos. Mark each customer as DELETABLE or HOLD.
4. **Stop and report.** If any row is AFTER or HOLD, I wait for your approval and delete nothing.
5. **Only if some rows qualify and you approve:** run one transaction, child tables first.
   - For each lead photo (G6), delete the storage file through the Storage API as well as its database row.
   - Report the number of files removed, then list the lead-photo files still in the test org's storage folders, so you can see none are orphaned.
6. **Read-back:** check every deleted id and confirm 0 rows are left. Compare before and after row counts for every other org to show nothing else changed. Write one audit_log row for the run.

## Technical notes
- Lists use read-only queries. Ids are shortened to 8 characters, phones to the last 4 digits and emails to the domain only.
- Deletions and Storage API removals are separate steps that each need your approval, as your process requires.
