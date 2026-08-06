Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/missed-call-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify(body),
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
});
