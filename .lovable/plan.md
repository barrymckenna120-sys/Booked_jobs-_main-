# Customers page: why the abdenneur test jobs aren't showing

## Findings (checked in the database)
1. **The jobs and customer exist and are linked correctly.** Under K&N gas services Ltd, jobs KN-010, KN-011 and KN-012 are all on the merged "abdenneur" customer (+212656802656). The customer is not archived and its area is D11. That company has 7 customers in total.
2. **Two companies use the same job numbers.** The older K&N Gas Services company also has KN-010, KN-011 and KN-012, belonging to Aisling Power, Mary O'Brien and Padraig Kelly. Both companies use the "KN" prefix.
3. **Your login is attached to the older company.** Your account (abdenneur1@gmail.com, superadmin) belongs to K&N Gas Services, not K&N gas services Ltd. The only account attached to K&N gas services Ltd is karl@bookedjobs.ie.
   - The Customers page only shows customers from the company your login belongs to (or the company you're viewing as). The kngasservices.bookedjobs.ie address doesn't change that after you're signed in.
   - So you're seeing the older company's list, where "abdenneur" doesn't exist. Searching "KN-010" there finds Aisling Power.

**Conclusion:** the missing customer is not a data problem, and not the main display bug either. The page is showing a different company. To see the test customer, sign in as karl@bookedjobs.ie, or use "view as" K&N gas services Ltd.

## Two small real display bugs found along the way (optional fix)
- **Saved customer list is shared across companies.** The page keeps a saved copy of the last list under one name for every company. After switching company, it can briefly show the previous company's customers until the fresh list loads.
- **Job-number search isn't limited to one company.** Searching a job number like "KN-010" looks it up without first picking the current company. For a superadmin that finds matches in both companies. Only the current company's customers are listed, so nothing leaks, but the search does extra work and the result is unclear.

## Proposed fix (only this page)
- Save the customer list separately for each company.
- Limit the job-number search to the current company.
- Add one regression test for the saved-list naming.
- Check by viewing as K&N gas services Ltd: "abdenneur" is listed, and searching "KN-010" shows only that customer. Then switch back to K&N Gas Services and check that searching "KN-010" shows Aisling Power, with no brief flash of the other company's customers.

Nothing changes in the booking intake, the database or the access rules.
