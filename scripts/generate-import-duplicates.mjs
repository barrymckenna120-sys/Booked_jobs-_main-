#!/usr/bin/env node
/**
 * BJ-0131 — mirrors the canonical customer-import duplicate matcher into the frontend.
 *
 *   supabase/functions/_shared/importDuplicates.ts   (canonical, edit this)
 *        -> src/lib/importDuplicates.generated.ts    (mirror, never edit)
 *
 * The canonical module is import-free and runtime-agnostic on purpose (no Deno,
 * no React, no Supabase), so the mirror is a byte copy with a banner. That is
 * what makes the browser preview and the Edge Functions classify duplicates
 * identically. Run with `--check` in tests to fail when the mirror has drifted.
 *
 *   node scripts/generate-import-duplicates.mjs
 *   node scripts/generate-import-duplicates.mjs --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "supabase/functions/_shared/importDuplicates.ts");
const TARGET = join(root, "src/lib/importDuplicates.generated.ts");

const BANNER = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Mirror of supabase/functions/_shared/importDuplicates.ts, produced by
 * scripts/generate-import-duplicates.mjs. Edit the canonical file under
 * supabase/functions/_shared/ and re-run the generator; any edit made here is
 * overwritten and will fail the drift test.
 */
/* eslint-disable */
// @generated from supabase/functions/_shared/importDuplicates.ts

`;

const expected = BANNER + readFileSync(SOURCE, "utf8");

if (process.argv.includes("--check")) {
  let actual = "";
  try {
    actual = readFileSync(TARGET, "utf8");
  } catch {
    console.error("Mirror missing. Run: node scripts/generate-import-duplicates.mjs");
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      "src/lib/importDuplicates.generated.ts has drifted from the canonical matcher.\n" +
        "Run: node scripts/generate-import-duplicates.mjs",
    );
    process.exit(1);
  }
  console.log("Import duplicate-matcher mirror is in sync.");
  process.exit(0);
}

writeFileSync(TARGET, expected);
console.log(`Wrote ${TARGET}`);
