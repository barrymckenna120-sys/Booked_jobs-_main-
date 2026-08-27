import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRebookTallyUrl, toLocalIrishPhone } from "./rebookLink.ts";

Deno.test("toLocalIrishPhone normalises all inbound shapes", () => {
  assertEquals(toLocalIrishPhone("+353871234567"), "0871234567");
  assertEquals(toLocalIrishPhone("353871234567"), "0871234567");
  assertEquals(toLocalIrishPhone("0871234567"), "0871234567");
  assertEquals(toLocalIrishPhone("87 123 4567"), "0871234567");
  assertEquals(toLocalIrishPhone(null), "");
});

Deno.test("buildRebookTallyUrl fills hidden fields and encodes values", () => {
  const url = buildRebookTallyUrl("https://rebook.kngasservices.ie/", {
    id: "c1",
    name: "Mary O'Brien",
    phone: "+353871234567",
    address: "12 Main St, Dublin",
    eircode: "D01 X1X1",
    area_code: "D01",
    boiler_brand: "Ideal",
    boiler_model: "Logic 24",
  });
  assertEquals(url.startsWith("https://rebook.kngasservices.ie/?"), true);
  const q = new URL(url).searchParams;
  assertEquals(q.get("Customer"), "Mary O'Brien");
  assertEquals(q.get("Mobile"), "0871234567");
  assertEquals(q.get("Address"), "12 Main St, Dublin");
  assertEquals(q.get("Boiler_model"), "Logic 24");
});

Deno.test("buildRebookTallyUrl respects an existing query string", () => {
  const url = buildRebookTallyUrl("https://tally.so/r/RGJDy4?src=call", { id: "c1" });
  const q = new URL(url).searchParams;
  assertEquals(q.get("src"), "call");
  assertEquals(q.get("Customer"), "");
});
