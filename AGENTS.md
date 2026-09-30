# AGENTS.md

## Environment facts
- `SUPABASE_DB_URL` IS a built-in variable on Lovable Cloud: available to Edge Functions via `Deno.env.get("SUPABASE_DB_URL")` and to the sandbox shell env (verified 27/09/26 with a throwaway check function, since deleted; value starts with `postgres://`). Treat it as a secret: never print, log, or return its value in chat, code, or tests. There is no UI to view or reset the DB password; only server-side code in the project environment can use it.
- Earlier workspace knowledge claiming "Lovable Cloud does not expose direct PostgreSQL connection strings" is WRONG for Edge Functions/workspace env — corrected. The GitHub backup secret `SUPABASE_DB_URL` (set up 23/09/26 outside this chat) originates from this built-in value.

- Help Centre content is version-controlled data in `src/help/guides/*.ts`, registered in `src/help/registry.ts`; one generic renderer under `src/pages/help/`. Why: new guides need no new page code (no CMS, no DB).
