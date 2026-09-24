# Set up abdenneur for the 14-day renewal reminder test

This changes data only: no code, no schedule and no settings. Everything is in K&N gas services Ltd (c0aa41ac-41ab-42d8-8085-972c072b0279).

## How the 14-day reminder decides who is due (checked in the code)
- **Date it reads:** the customer's next service due. It lists customers whose date is exactly 14 days from the day it runs, not today. If it runs today (24/09/26), the target date is **08/10/26**.
- **Who it skips:**
  - customers who have opted out (abdenneur hasn't)
  - customers with a Pending, Booked or Confirmed job dated today or later. abdenneur has three, which is why they must be cancelled.
  - customers whose latest job already sent a 14-day reminder (none have)
- **When it runs:** nothing in our system runs it on a schedule. Your Make scenario calls it, and Make sends the WhatsApp.
- **Timing:** 08/10/26 only matches on a run today. If Make next runs it tomorrow, the date would need to be 09/10/26.

## The 4 rows that will change

| # | Record | Field | Before | After |
|---|---|---|---|---|
| 1 | Job KN-010 (f5b0e442-5170-4906-b15a-47ae9aac4253) | status | Pending | Cancelled |
| 2 | Job KN-011 (1150edcb-1329-4db7-bc0c-587b011396bb) | status | Pending | Cancelled |
| 3 | Job KN-012 (b24bdcf6-2c92-413b-a068-30ced924cf55) | status | Pending | Cancelled |
| 4 | Customer abdenneur (9061a3d8-dc28-45be-a39a-f39364345814) | next service due | 2027-09-24 | 2026-10-08 |

- **Details recorded on the 3 jobs:** each gets a cancellation reason ("Test data – renewal reminder test"), a cancelled time of now, and its confirmation cleared. This is the same way a manual cancellation in the app records it.
- **Row limits:** every change is limited to these exact records and to this company.

## Side effect to expect
Cancelling the jobs will create normal office alerts in the app, the same as cancelling from the app. Cancelling does not send any WhatsApp to the customer.

## After the change
- **Check:** read the 4 rows back to confirm the new values, and confirm the company's other customers and jobs are unchanged. The company has 7 customers.
- **Report:** give you the exact before/after values.
- **Next step for you:** run the 14-day reminder in Make today. I'll then confirm abdenneur came up in the list and that one WhatsApp was logged.
