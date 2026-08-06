// TEMPORARY verification probe — deleted immediately after use.
// Exercises the create-booking-link auth guard using server-side secrets so no
// secret value is ever printed or returned.
Deno.serve(async () => {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/create-booking-link`;
  const body = JSON.stringify({
    full_url: "https://tally.so/r/probe-check",
    organisation_id: "8c37827f-ce2c-4507-a821-a5e807d89856",
  });

  const results: Record<string, number> = {};

  const svc = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body,
  });
  results.service_role = svc.status;

  const mk = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": Deno.env.get("MAKE_WEBHOOK_SECRET") ?? "",
    },
    body,
  });
  results.make_secret = mk.status;
  results.make_secret_configured = Deno.env.get("MAKE_WEBHOOK_SECRET") ? 1 : 0;

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
