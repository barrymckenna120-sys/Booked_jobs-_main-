/**
 * BJ-0131 — customer import duplicate detection (frontend entry point).
 *
 * The implementation now lives in supabase/functions/_shared/importDuplicates.ts
 * so the browser preview and the preview/commit Edge Functions classify
 * duplicates with the exact same code. This file is a thin re-export of the
 * generated mirror; keeping the path stable means every existing import site
 * and the 19 existing unit tests are untouched.
 *
 * Edit the canonical file, then run: node scripts/generate-import-duplicates.mjs
 */
export * from "./importDuplicates.generated";
