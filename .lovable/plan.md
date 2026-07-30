## Goal
Add GPRN to the Notification of Hazard flow, matching the other four cert flows, with a defensive sync for late-arriving `customer`.

## 1. `src/components/engineer/HazardNotificationFlow.tsx`

**Import** (L7):
```diff
 import { supabase } from "@/integrations/supabase/client";
+import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";
```

**State** (~L202, beside the other form state):
```diff
   const [location, setLocation] = useState("");
+  const [gprn, setGprn] = useState(customer?.gprn || "");
```
Editable rather than read-only, so an engineer can enter a GPRN the customer record doesn't have yet — that's what makes the back-fill meaningful.

**Async-customer safeguard** (immediately after the state):
```diff
+  // customer is normally loaded before this flow mounts, but if it arrives
+  // late, adopt its GPRN — only while the field is still untouched/empty, so
+  // it can never clobber something the engineer has typed.
+  useEffect(() => {
+    if (!gprn && customer?.gprn) setGprn(customer.gprn);
+  }, [customer?.gprn]);
```

**Property Details field list** (~L425), directly after Eircode in the existing 2-column grid:
```diff
           <ReadOnlyField label="Eircode" value={customer?.eircode || ""} />
+          <EditField label="GPRN" value={gprn} onChange={setGprn} placeholder="e.g. 3445AB12" />
         </div>
```

**Save** — await the helper after a successful insert, before the PDF invoke:
```diff
     const newId = (insertedRow as any)?.id;
+    await backfillCustomerGprn(customer?.id, gprn);
     setHazardId(newId);
     setPhase("success");
```
Awaiting matters: `generate-hazard-pdf` reads GPRN off the customer row, so the write must land before the function is invoked. The helper never throws and only writes when the customer's `gprn` is null/empty, so an existing value is never overwritten.

GPRN is not stored on `hazard_notifications` (no such column) — it lives on the customer record, which is where the PDF reads it. No schema change.

## 2. PDF generator — verified, no change needed
`supabase/functions/generate-hazard-pdf/index.ts` L227, inside PROPERTY DETAILS right after Eircode:
```ts
if (customer?.gprn) fieldPair("GPRN", customer.gprn, margin + 2);
```
`customer` is the row fetched at L99 via `select("*")` on `hazard.customer_id` — live and wired, not dead code. Conditional, so certs for customers without a GPRN are unchanged.

## Verification
`bunx tsgo --noEmit`, then a manual pass: open the hazard flow for a customer with a GPRN (prefilled), and for one without (blank, entering a value writes it to the customer and it appears on the PDF).

## Risk
Low — one flow, one added field, no schema/RLS/edge-function changes.
