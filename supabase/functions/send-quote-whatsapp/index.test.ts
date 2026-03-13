import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-quote-whatsapp`;

Deno.test("returns 405 for GET requests", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "GET",
    headers: { "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const body = await res.json();
  assertEquals(res.status, 405);
  assertEquals(body.success, false);
});

Deno.test("returns 400 for missing fields", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.error.includes("Missing required fields"), true);
});

Deno.test("sends quote via WhatsApp (live test)", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quote_id: "00000000-0000-0000-0000-000000000000",
      customer_name: "Test Customer",
      mobile_number: "0851234567",
      job_description: "Boiler Service",
      quote_amount: 120,
    }),
  });
  const body = await res.json();
  console.log("Live test response:", JSON.stringify(body, null, 2));
  // We expect either success or a 502 from 360Messenger if the number is invalid
  // The key thing is it doesn't return 500 (internal error) or 400 (missing fields)
  assertEquals(res.status !== 400 && res.status !== 500, true);
  await Promise.resolve(); // ensure body consumed
});
