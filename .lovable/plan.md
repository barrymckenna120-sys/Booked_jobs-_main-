src/pages/QuoteDetail.tsx — narrow fix for respond_to_quote RPC

Implement only steps 1, 2, and 4 as requested:

1. Rename the existing `markAccepted` handler to `respondToQuote(accepted: boolean)` and pass the boolean through to the RPC:

```typescript
const respondToQuote = async (accepted: boolean) => {
  if (!id) return;
  try {
    const { error } = await supabase.rpc("respond_to_quote", {
      p_quote_id: id,
      p_accepted: accepted,
      p_access_token: quote?.access_token,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: accepted ? "Quote accepted — job created ✅" : "Quote rejected" });
    queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
    if (accepted) {
      supabase.functions.invoke("quote-accepted-alert", { body: { quote_id: id } }).catch(() => {});
    }
  } catch (err: any) {
    toast({ title: "Error", description: err.message, variant: "destructive" });
  }
};
```

2. Add a local `QuoteWithCustomer` type using the generated Supabase `Database` row types and remove the `as any` cast on `access_token`:

```typescript
import type { Database } from "@/integrations/supabase/types";

type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type QuoteWithCustomer = QuoteRow & { customers: CustomerRow };
```

Replace `const q: any = quote;` with `const q = quote as QuoteWithCustomer;`.

3. Do NOT add a Reject button; keep the existing Accept button calling `respondToQuote(true)`.

4. Keep all other RPC calls, styling, calculations, and UI unchanged.

What will be reported back: the corrected `respond_to_quote` call, the type change, and confirmation that the Accept button still works end-to-end.