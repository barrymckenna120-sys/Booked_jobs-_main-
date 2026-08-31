#!/usr/bin/env node
/**
 * Mirrors the canonical WhatsApp catalogue into the frontend.
 *
 *   supabase/functions/_shared/whatsappCatalogue.ts   (canonical, edit this)
 *        -> src/lib/whatsappCatalogue.generated.ts    (mirror, never edit)
 *
 * The canonical module is import-free and runtime-agnostic on purpose, so the
 * mirror is a byte copy with a banner. Run with `--check` in CI/tests to fail
 * when the mirror has drifted.
 *
 *   node scripts/generate-whatsapp-catalogue.mjs
 *   node scripts/generate-whatsapp-catalogue.mjs --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "supabase/functions/_shared/whatsappCatalogue.ts");
const TARGET = join(root, "src/lib/whatsappCatalogue.generated.ts");

const BANNER = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Mirror of supabase/functions/_shared/whatsappCatalogue.ts, produced by
 * scripts/generate-whatsapp-catalogue.mjs. Edit the canonical file under
 * supabase/functions/_shared/ and re-run the generator; any edit made here is
 * overwritten and will fail the drift test.
 */
/* eslint-disable */
// @generated from supabase/functions/_shared/whatsappCatalogue.ts

`;

const source = readFileSync(SOURCE, "utf8");
const expected = BANNER + source;

if (process.argv.includes("--check")) {
  let actual = "";
  try {
    actual = readFileSync(TARGET, "utf8");
  } catch {
    console.error("Mirror missing. Run: node scripts/generate-whatsapp-catalogue.mjs");
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      "src/lib/whatsappCatalogue.generated.ts has drifted from the canonical catalogue.\n" +
        "Run: node scripts/generate-whatsapp-catalogue.mjs",
    );
    process.exit(1);
  }
  console.log("WhatsApp catalogue mirror is in sync.");
  process.exit(0);
}

writeFileSync(TARGET, expected);
console.log(`Wrote ${TARGET}`);
