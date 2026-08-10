// Single source of truth for revenue recognition, shared with the edge functions.
// The implementation lives in supabase/functions/_shared/financeMetrics.ts so the
// accountant export (Deno) and the app (Vite) cannot drift apart.
export * from "../../supabase/functions/_shared/financeMetrics";
