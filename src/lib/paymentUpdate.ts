// Single source of truth for payment field writes on service_calls, shared with
// the edge functions. Implementation lives in
// supabase/functions/_shared/paymentUpdate.ts so the SumUp webhook (Deno) and the
// app (Vite) cannot drift apart.
export * from "../../supabase/functions/_shared/paymentUpdate";
