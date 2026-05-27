Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let bodyJson = {};
  let bodyRaw = "";

  try {
    bodyRaw = await req.text();
    bodyJson = JSON.parse(bodyRaw);
  } catch {
    // not JSON, raw text captured
  }

  console.log("=== INBOUND WEBHOOK ===");
  console.log("Method:", req.method);
  console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers)));
  console.log("Body JSON:", JSON.stringify(bodyJson));
  console.log("Body Raw:", bodyRaw);

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
