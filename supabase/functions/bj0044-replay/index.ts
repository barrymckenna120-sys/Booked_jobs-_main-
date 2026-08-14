/**
 * TEMPORARY verification relay for BJ-0044 (payment_failed timeline entry).
 * Reads SUMUP_WEBHOOK_SECRET server-side and replays a signed delivery to
 * sumup-payment-webhook. Deleted immediately after the evidence is captured.
 */
const TOKEN = "bj0044-replay-1a7f3c9e";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) {
    return new Response("nope", { status: 401 });
  }
  const checkoutId = url.searchParams.get("checkout") ?? "";
  const secret = Deno.env.get("SUMUP_WEBHOOK_SECRET") ?? "";
  const base = Deno.env.get("SUPABASE_URL")!;
  const res = await fetch(
    `${base}/functions/v1/sumup-payment-webhook?s=${encodeURIComponent(secret)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: checkoutId, event_type: "CHECKOUT_STATUS_CHANGED" }),
    },
  );
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text }), {
    headers: { "Content-Type": "application/json" },
  });
});
