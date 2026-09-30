# AGENTS.md

## Environment facts
- `SUPABASE_DB_URL` IS a built-in variable on Lovable Cloud: available to Edge Functions via `Deno.env.get("SUPABASE_DB_URL")` and to the sandbox shell env (verified 27/09/26 with a throwaway check function, since deleted; value starts with `postgres://`). Treat it as a secret: never print, log, or return its value in chat, code, or tests. There is no UI to view or reset the DB password; only server-side code in the project environment can use it.
- Earlier workspace knowledge claiming "Lovable Cloud does not expose direct PostgreSQL connection strings" is WRONG for Edge Functions/workspace env — corrected. The GitHub backup secret `SUPABASE_DB_URL` (set up 23/09/26 outside this chat) originates from this built-in value.

- Help Centre content is version-controlled data in `src/help/guides/*.ts`, registered in `src/help/registry.ts`; one generic renderer under `src/pages/help/`. Why: new guides need no new page code (no CMS, no DB).
- Help screenshot callouts are percentage-positioned renderer overlays, never baked into source images. Why: clean screenshots stay reusable and markers scale in normal and enlarged views.
- Help screenshot callouts and continuous screens are renderer overlays/segments, never modified source images. Why: clean screenshots stay reusable.
- All Help screenshots use the shared full-resolution zoom/pan viewer with a 5× maximum and safe-area-fixed controls. Why: desktop UI details must remain readable on iPhone.
- WhatsApp test-mode allow-list lives in `organisation_whatsapp_allowed_numbers` (superadmin-only RLS), not a column on `organisations`. Why: tenant members can read their whole organisations row, so a column would expose the list.
- `organisations.whatsapp_test_mode` is guarded by the SECURITY INVOKER trigger `protect_whatsapp_test_mode` (only superadmin/backend may change it). Why: a SECURITY DEFINER trigger sees current_user as the owner and let tenant owners through.
- Cross-tenant `message_log` access is superadmin SELECT-only for `suppressed_test_mode`; ordinary history stays tenant-scoped. Why: oversight must not expose customer communications.
