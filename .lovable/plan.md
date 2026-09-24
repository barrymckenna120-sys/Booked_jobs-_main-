# Keep the country code in the rebooking link's Mobile value

## Where it happens (confirmed)
The same block of code is copied into two places. There is no shared helper.
- `supabase/functions/renewal-reminder-14/index.ts` lines ~150-162
- `supabase/functions/renewal-reminder-30/index.ts` lines ~154-165

The block removes the company's country code (from the messaging settings, default `353`) and always adds a leading `0`: `localPhone = "0" + digits.slice(ccLen)`. For `+212656802656`, the code sees that the number doesn't start with 353, but still cuts the first 3 digits and adds `0`. The result is `0656802656`, so the country code is lost.

The warranty message (`send-warranty-whatsapp`) builds its own `Mobile=` from a different phone value. It's out of scope and won't change.

## Fix
One small shared helper, used by both reminders. Only the `Mobile=` value changes.

```text
_shared/rebookPhone.ts  (new)
  rebookMobileParam(storedPhone, orgCountryCode) -> string
    - stored starts with "+" or "00"  -> "+<digits>"  (kept as-is, e.g. +212656802656)
    - local: "0" + 9 digits            -> "+<cc>" + rest  (087... -> +35387...)
    - bare 9 digits                     -> "+<cc>" + digits
    - digits already begin with <cc>    -> "+<digits>"
    - anything else                     -> "+<digits>" if 7-15 digits, else "" (field left blank)
```

The link is written as `&Mobile=${encodeURIComponent(rebookMobileParam(c.phone, countryCode))}`, so `+` travels as `%2B`.

Diff in each reminder:
```diff
-      let digits = (c.phone || "").replace(/\D/g, "");
-      const ccLen = countryCode.length;
-      if (...) {...} else if (...) {...} else if (...) {...}
-      const localPhone = "0" + digits.slice(ccLen);
+      const mobileParam = rebookMobileParam(c.phone, countryCode);
 ...
-        `&Mobile=${localPhone}` +
+        `&Mobile=${encodeURIComponent(mobileParam)}` +
```
Customer, Address, Eircode, Areacode, Boiler_Brand and Boiler_model lines stay exactly the same. Only these two reminders change; the rest of each function is untouched.

## Irish customers
Irish links change from `Mobile=0871234567` to `Mobile=%2B353871234567`. It's the same number, and the country code is now included. The rebooking form's phone box already shows +353, and Tally's phone box accepts a full international number as its pre-filled value. **Confirm this on the live form** before relying on it. If it shows the number wrongly, the fallback is to keep the old `0…` format for Irish numbers only and send `+CC…` for everyone else. That would be a single change inside the helper.

## Verification
- Tests for the helper:
  - `+212656802656` stays `+212656802656`.
  - `0871234567` becomes `+353871234567`.
  - `353871234567` becomes `+353871234567`.
  - `00447911123456` becomes `+447911123456`.
  - Empty or junk values give blank.
- Check that the whole link is otherwise identical (the other six fields) for one Irish and one international sample.
- After you approve the diff, deploy only `renewal-reminder-14` and `renewal-reminder-30`.
- Open a pre-filled rebook link for abdenneur (+212) and one Irish test number. Take screenshots showing how the phone box on rebook.kngasservices.ie fills in. This opens the form only; nothing is submitted.
- Next real 14-day run: the link's destination carries `Mobile=%2B212656802656`.
