import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_jobs",
  title: "List jobs",
  description:
    "List the signed-in user's jobs (service calls), optionally filtered by status, engineer or scheduled date range. Newest scheduled first.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe('Job status, e.g. "Scheduled", "Completed", "Cancelled".'),
    engineer: z.string().trim().min(1).optional().describe("Assigned engineer name (partial match)."),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest scheduled date (YYYY-MM-DD)."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest scheduled date (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum rows to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, engineer, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("service_calls")
      .select("id, job_type, status, scheduled_date, time_block, assigned_engineer, revenue, notes, customer_id, created_at");

    if (status) query = query.eq("status", status);
    if (engineer) query = query.ilike("assigned_engineer", `%${engineer}%`);
    if (from) query = query.gte("scheduled_date", from);
    if (to) query = query.lte("scheduled_date", to);

    const { data, error } = await query
      .order("scheduled_date", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        { type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "No jobs matched those filters." },
      ],
      structuredContent: { count: rows.length, jobs: rows },
    };
  },
});
