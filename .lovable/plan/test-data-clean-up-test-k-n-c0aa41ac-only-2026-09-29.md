# Test data clean-up: TEST K&N (c0aa41ac) only

Scope: only records in org `c0aa41ac-41ab-42d8-8085-972c072b0279` created **since 28/09/26**. No start date was given, so I used 28/09/26, when the Zjq5rA tests started. Tell me if you want a different date. Nothing has been deleted.

Everything matched traces back to **one customer**, "barry test". Nothing else in the org matched the rules for name, email, phone, Eircode, address or submission ID.

## Customers (1)
| id | name | email | phone | Eircode | created |
|---|---|---|---|---|---|
| f55d4ca0… | barry test | barrymckenna120@gmail.com | +353872354257 | D24 W289 | 29/09/26 10:14 |

## Boiler enquiries (2)
| id | name | submission | created |
|---|---|---|---|
| 3be7735b… | barry | vX1dvXd | 29/09/26 13:00 |
| cb784c77… | Test Lead | xV1lzgv | 29/09/26 13:22 |

## Jobs (2)
| id | ref | type | status | flag |
|---|---|---|---|---|
| 3062381b… | KN-001 | Boiler Repair | Completed / paid | **FLAG: 2 payments recorded** |
| 6de44ba2… | KN-002 | Boiler Replacement | Pending / unpaid | none |

## Payments (2), both on KN-001: FLAG
| id | amount | method | type | created |
|---|---|---|---|---|
| af5936e7… | €50 | SumUp | deposit | 29/09/26 10:16 |
| 619fdca1… | €50 | card | balance | 29/09/26 10:21 |

The €50 SumUp deposit went through a real card checkout. Because of this, I'm treating KN-001, its payments and its receipt message as **do not delete** unless you tell me otherwise. No invoices were found for this customer.

## Quotes (2)
| id | number | total | status | linked to |
|---|---|---|---|---|
| b48ca171… | Q-2026-0001 | €100 | converted | KN-001 (FLAG) |
| ad3b569d… | Q-2026-0002 | €2,460 | viewed | enquiry 3be7735b + KN-002 |

## Photos and videos (4)
| id | file location | linked to |
|---|---|---|
| d6faf7c2… | job-media/customers/f55d4ca0…/3062381b…/1790677143546_image.jpg | KN-001 (FLAG) |
| 440e09bb… | cloudinary/alzyhldqjbqmidx4r0rw (Cloudinary, not our storage) | KN-001 (FLAG) |
| cfc6f734… | job-media/c0aa41ac…/boiler-enquiries/3be7735b…/ced2b3cd….png | enquiry 3be7735b |
| 08e39648… | job-media/c0aa41ac…/boiler-enquiries/cb784c77…/f3e49e50….png | enquiry cb784c77 |

## Activity (10)
- **KN-001:** 7 rows (booked, 2 WhatsApps, 2 payments, completed, receipt). FLAG.
- **KN-002:** 1 row (booked).
- **Enquiries:** 2 rows, "New boiler enquiry received".

## Message log (7)
- **KN-001:** 6 rows (quote, payment link, SumUp confirmed, part payment, booking confirmation, receipt). FLAG.
- **Q-2026-0002:** 1 row (quote).

## Proposed delete (after you reply "approved")
Two options:
- **A (safe, recommended):** delete only records not tied to a payment:
  - both enquiries and their 2 photos (database rows plus storage files)
  - Q-2026-0002 and KN-002, with their 1 activity row and 1 message log row
  - the 2 enquiry activity rows
  - Keep "barry test", KN-001, its payments, Q-2026-0001, its media, activity and messages.
- **B (everything):** also delete KN-001, its 2 payments, Q-2026-0001, its media and Cloudinary video, and the customer. You must say this explicitly, because payment history is append-only.

Delete order: storage files, then photo rows, then activity and message log, then quotes, then jobs, then enquiries, then (B only) payments and the customer. Afterwards I'll read back every id to show 0 rows left. I'll also compare total row counts for this org and every other org before and after, so you can see nothing else changed. Each step runs separately.
