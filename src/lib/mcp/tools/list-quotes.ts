import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_quotes",
  title: "List quotes",
  description:
    "List the signed-in user's quotes with totals and status (Draft, Sent, Accepted, Paid, Expired). Newest first.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe('Quote status, e.g. "Sent" or "Accepted".'),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum rows to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("quotes")
      .select("id, job_id, customer_id, description, parts_cost, labour_cost, callout_cost, total_amount, status, sent_at, accepted_at, paid_at, created_at");

    if (status) query = query.eq("status", status);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        { type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "No quotes matched those filters." },
      ],
      structuredContent: { count: rows.length, quotes: rows },
    };
  },
});
