# Apply Grant and Verify

1. Run the single migration statement: `GRANT EXECUTE ON FUNCTION public.get_user_organisation_id() TO authenticated;`.
2. After it applies, run the verification query: `SELECT proname, proacl FROM pg_proc WHERE proname = 'get_user_organisation_id';`.
3. Confirm that `authenticated=X` appears in the `proacl` output and report it back.

No other database objects, RLS policies, functions, or frontend code will be touched.