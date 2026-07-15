// Retired: this function has been replaced by `tally-incoming-job`.
// Keeping the endpoint alive so any undiscovered legacy caller receives a
// loud 410 Gone instead of silently succeeding or 404-ing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-webhook-secret",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "Gone",
      message:
        "tally-webhook is retired. Point your Tally/Make scenario at tally-incoming-job instead.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
