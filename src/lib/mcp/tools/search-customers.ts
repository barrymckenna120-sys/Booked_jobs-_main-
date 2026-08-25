import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_customers",
  title: "Search customers",
  description:
    "Search the signed-in user's customers by name, phone, email, address or eircode. Returns contact details, boiler info and next service due date.",
  inputSchema: {
    query: z.string().trim().min(2).describe("Name, phone, email, address or eircode fragment."),
    limit: z.number().int().min(1).max(25).optional().describe("Maximum rows to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const digits = query.replace(/\D/g, "");
    const like = `%${query}%`;
    const filters = [
      `name.ilike.${like}`,
      `email.ilike.${like}`,
      `address.ilike.${like}`,
      `eircode.ilike.${like}`,
    ];
    if (digits.length >= 4) filters.push(`phone.ilike.%${digits.slice(-9)}%`);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, email, address, eircode, area_code, boiler_make_model, last_service_date, next_service_due, service_status, opted_out")
      .or(filters.join(","))
      .order("name", { ascending: true })
      .limit(limit ?? 10);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rows.length ? JSON.stringify(rows, null, 2) : `No customers matched "${query}".`,
        },
      ],
      structuredContent: { count: rows.length, customers: rows },
    };
  },
});
