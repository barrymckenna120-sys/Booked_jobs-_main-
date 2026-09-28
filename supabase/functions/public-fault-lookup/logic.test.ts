/**
 * public-fault-lookup tests.
 *
 * Cover the guarantees that matter: drafts never surface, sensitive fields
 * never leave the function, the brand allow-list is enforced, validation
 * rejects bad input, and the queries really do filter status='published'.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCodesPayload,
  buildLookup,
  buildModelsPayload,
  isAllowedBrand,
  isValidUuid,
  normCode,
} from "./logic.ts";
import { handle, type FaultDb, type FaultQuery } from "./handler.ts";

/* ---------- pure helpers ---------- */

Deno.test("normCode matches faultFinder (case, spaces, dots, dashes)", () => {
  assertEquals(normCode(" e 133 "), "E133");
  assertEquals(normCode("E-133"), "E133");
  assertEquals(normCode("e.133"), "E133");
  assertEquals(normCode("E133"), "E133");
  assertEquals(normCode("L2"), "L2");
});

Deno.test("allowed brands resolve canonically (case-insensitive); Viessmann stays blocked", () => {
  assertEquals(isAllowedBrand("ideal"), "Ideal");
  assertEquals(isAllowedBrand("BAXI"), "Baxi");
  assertEquals(isAllowedBrand("glow-worm"), "Glow-worm");
  assertEquals(isAllowedBrand("glow worm"), "Glow-worm");
  assertEquals(isAllowedBrand("worcester bosch"), "Worcester Bosch");
  assertEquals(isAllowedBrand("WORCESTER-BOSCH"), "Worcester Bosch");
  assertEquals(isAllowedBrand("vaillant"), "Vaillant");
  assertEquals(isAllowedBrand("Viessmann"), null);
  assertEquals(isAllowedBrand(""), null);
});

Deno.test("model ids must be valid UUIDs", () => {
  assertEquals(isValidUuid("8c37827f-ce2c-4507-a821-a5e807d89856"), true);
  assertEquals(isValidUuid("not-a-uuid"), false);
  assertEquals(isValidUuid(""), false);
  assertEquals(isValidUuid("8c37827fce2c4507a821a5e807d89856"), false);
});

/* ---------- draft / sensitive-field guarantees ---------- */

const codeRow = (over: Record<string, unknown>) => ({
  code: "E133", category: "fault", explanation: "x", manual_url: "https://m",
  status: "published", draft_test_excluded: false, ...over,
});

Deno.test("draft codes are never returned", () => {
  const rows = [
    codeRow({ code: "E133" }),
    codeRow({ code: "E999", status: "draft" }),
    codeRow({ code: "E777", draft_test_excluded: true, status: "draft" }),
  ];
  assertEquals(buildCodesPayload(rows as never).map((r) => r.code), ["E133"]);
  const lookup = buildLookup(rows as never, "E999", "Baxi");
  assertEquals(lookup.found, false);
});

Deno.test("draft models are never returned", () => {
  const rows = [
    { id: "a", brand: "Ideal", model_name: "Logic Combi", status: "published", draft_test_excluded: false },
    { id: "b", brand: "Ideal", model_name: "Logic Max Combi", status: "draft", draft_test_excluded: false },
  ];
  assertEquals(buildModelsPayload(rows as never).map((m) => m.model_name), ["Logic Combi"]);
});

Deno.test("lookup payloads never include possible_causes, technical_details or other internal fields", () => {
  const rows = [
    codeRow({
      code: "E133",
      explanation: "Ignition failure",
      possible_causes: ["Gas supply"],
      technical_details: "SECRET",
      manual_page: "74",
      manual_revision: "rev 5",
      verified_by: "someone",
      notes: "internal",
      organisation_id: "org-1",
    }),
  ];
  const found = buildLookup(rows as never, "E133", "Baxi");
  assertEquals(Object.keys(found).sort(), ["category", "code", "explanation", "found", "manual_url"]);
  const missed = buildLookup(rows as never, "ZZ9", "Ideal");
  assertEquals(Object.keys(missed).sort(), ["found", "manual_url"]);
  assertEquals(missed, { found: false, manual_url: "https://idealheating.com/tech-hub/literature" });
});

Deno.test("codes payload only contains code and category", () => {
  const out = buildCodesPayload([codeRow({})] as never);
  assertEquals(Object.keys(out[0]).sort(), ["category", "code"]);
});

Deno.test("codes sort fault first, then message, then status", () => {
  const rows = [
    codeRow({ code: "S1", category: "status" }),
    codeRow({ code: "E2", category: "message" }),
    codeRow({ code: "E1", category: "fault" }),
  ];
  assertEquals(buildCodesPayload(rows as never).map((r) => r.code), ["E1", "E2", "S1"]);
});

/* ---------- handler behaviour with a stub db ---------- */

type Filter = [string, string, unknown];

const stubDb = (tables: Record<string, Record<string, unknown>[]>): FaultDb & {
  filtersFor: (table: string) => Filter[];
} => {
  const filters: Record<string, Filter[]> = {};
  const db = {
    filtersFor: (table: string) => filters[table] ?? [],
    from(table: string) {
      filters[table] = [];
      const b: Record<string, unknown> = {};
      const rec = (kind: string) => (col: string, val: unknown) => {
        filters[table].push([kind, col, val] as Filter);
        return b;
      };
      b.select = () => b;
      b.eq = rec("eq");
      b.ilike = rec("ilike");
      b.maybeSingle = async () => {
        const statusEq = filters[table].some(([k, c, v]) => k === "eq" && c === "status" && v === "published");
        const idEq = filters[table].find(([k, c]) => k === "eq" && c === "id");
        let row: Record<string, unknown> | null = tables[table]?.[0] ?? null;
        if (idEq) row = row && row.id === idEq[2] ? row : null;
        if (statusEq && row && row.status !== "published") row = null;
        return { data: row, error: null };
      };
      const anyB = b as unknown as { then: (res?: unknown, rej?: unknown) => Promise<unknown> };
      anyB.then = (res, rej) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(
          res as (v: unknown) => unknown, rej as (e: unknown) => unknown,
        );
      return b as unknown as FaultQuery;
    },
  };
  return db as never;
};

const req = (qs: string, origin = "https://www.kngasservices.ie") =>
  new Request(`https://example.com/functions/v1/public-fault-lookup?${qs}`, {
    headers: { Origin: origin },
  });

const deps = (db: FaultDb) => ({ db, allowedOrigins: () => ["https://www.kngasservices.ie", "https://kngasservices.ie"] });

Deno.test("codes action filters status='published' on both queries", async () => {
  const modelId = "8c37827f-ce2c-4507-a821-a5e807d89856";
  const db = stubDb({
    boiler_fault_models: [{ id: modelId, brand: "Ideal", model_name: "Logic Combi", status: "published" }],
    boiler_fault_codes: [codeRow({ code: "E133" }), codeRow({ code: "E999", status: "draft" })],
  });
  const res = await handle(req(`action=codes&model_id=${modelId}`), deps(db));
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body, [{ code: "E133", category: "fault" }]);
  assertEquals(db.filtersFor("boiler_fault_models").some(([k, c, v]) => k === "eq" && c === "status" && v === "published"), true);
  assertEquals(db.filtersFor("boiler_fault_codes").some(([k, c, v]) => k === "eq" && c === "status" && v === "published"), true);
});

Deno.test("codes for an unpublished (draft) model return an empty list, not the codes", async () => {
  const modelId = "8c37827f-ce2c-4507-a821-a5e807d89856";
  const db = stubDb({
    boiler_fault_models: [{ id: modelId, brand: "Ideal", model_name: "Logic Combi", status: "draft" }],
    boiler_fault_codes: [codeRow({ code: "E133" })],
  });
  const res = await handle(req(`action=codes&model_id=${modelId}`), deps(db));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), []);
});

Deno.test("disallowed brand returns []", async () => {
  const db = stubDb({});
  const res = await handle(req("action=models&brand=Worcester"), deps(db));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), []);
  assertEquals(db.filtersFor("boiler_fault_models").length, 0);
});

Deno.test("allowed brand returns published models sorted, filtered by status", async () => {
  const db = stubDb({
    boiler_fault_models: [
      { id: "b", brand: "Ideal", model_name: "Logic Max Combi", status: "published" },
      { id: "a", brand: "Ideal", model_name: "Logic Combi", status: "published" },
      { id: "c", brand: "Ideal", model_name: "Draft Model", status: "draft" },
    ],
  });
  const res = await handle(req("action=models&brand=ideal"), deps(db));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), [
    { id: "a", brand: "Ideal", model_name: "Logic Combi" },
    { id: "b", brand: "Ideal", model_name: "Logic Max Combi" },
  ]);
});

Deno.test("bad UUID returns 400", async () => {
  const db = stubDb({});
  const res = await handle(req("action=codes&model_id=not-a-uuid"), deps(db));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_model_id");
  const res2 = await handle(req("action=lookup&model_id=nope&code=E133"), deps(db));
  assertEquals(res2.status, 400);
});

Deno.test("bad code and unknown action return 400", async () => {
  const modelId = "8c37827f-ce2c-4507-a821-a5e807d89856";
  const db = stubDb({});
  assertEquals((await handle(req(`action=lookup&model_id=${modelId}&code=${"x".repeat(61)}`), deps(db))).status, 400);
  assertEquals((await handle(req("action=everything"), deps(db))).status, 400);
  assertEquals((await handle(req("action=lookup&model_id=" + modelId), deps(db))).status, 400);
});

Deno.test("allowed origin gets CORS headers; disallowed origin is rejected", async () => {
  const db = stubDb({});
  const ok = await handle(req("action=models&brand=Baxi"), deps(db));
  assertEquals(ok.headers.get("Access-Control-Allow-Origin"), "https://www.kngasservices.ie");
  assertEquals(ok.headers.get("Cache-Control"), "public, max-age=300");
  const bad = await handle(req("action=models&brand=Baxi", "https://evil.example"), deps(db));
  assertEquals(bad.status, 403);
  assertEquals(bad.headers.get("Access-Control-Allow-Origin"), null);
  const preflight = await handle(new Request("https://example.com/x", {
    method: "OPTIONS", headers: { Origin: "https://www.kngasservices.ie" },
  }), deps(db));
  assertEquals(preflight.status, 200);
});

Deno.test("non-GET requests are rejected", async () => {
  const db = stubDb({});
  const res = await handle(new Request("https://example.com/x?action=models&brand=Baxi", {
    method: "POST", headers: { Origin: "https://www.kngasservices.ie" }, body: "{}",
  }), deps(db));
  assertEquals(res.status, 405);
});

Deno.test("lookup hit and miss behave per spec", async () => {
  const modelId = "8c37827f-ce2c-4507-a821-a5e807d89856";
  const db = stubDb({
    boiler_fault_models: [{ id: modelId, brand: "Baxi", model_name: "800 Combi", status: "published" }],
    boiler_fault_codes: [codeRow({ code: "E133" })],
  });
  const res = await handle(req(`action=lookup&model_id=${modelId}&code=e 133 `), deps(db));
  assertEquals(await res.json(), { found: true, code: "E133", category: "fault", explanation: "x", manual_url: "https://m" });
  const miss = await handle(req(`action=lookup&model_id=${modelId}&code=ZZ9`), deps(db));
  assertEquals(await miss.json(), { found: false, manual_url: "https://www.baxi.co.uk/support/literature" });
});

/* ---------- shared matcher: "/" alternatives and empty searches ---------- */

Deno.test("lookup: '/' alternatives, empty search never matches, existing codes still match", () => {
  const rows = ["F1", "F4 / L4", "--", "F.22", "228", "Flame On Before Gas On"].map((code) => codeRow({ code }));
  const code = (q: string) => { const r = buildLookup(rows as never, q, "Ideal"); return r.found ? r.code : null; };
  assertEquals(code("f4"), "F4 / L4");
  assertEquals(code("l4"), "F4 / L4");
  assertEquals(code("F4/L4"), "F4 / L4");
  assertEquals(code("F 1"), "F1");
  assertEquals(code("--"), null);
  assertEquals(code("-"), null);
  assertEquals(code(""), null);
  assertEquals(code("F22"), "F.22");
  assertEquals(code("228"), "228");
  assertEquals(code("flame on before gas on"), "Flame On Before Gas On");
});
