import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_job",
  title: "Get job details",
  description:
    "Fetch one job (service call) by its id, including the linked customer's contact and boiler details.",
  inputSchema: {
    job_id: z.string().uuid().describe("The job id (uuid) from list_jobs."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: job, error } = await supabase
      .from("service_calls")
      .select("*")
      .eq("id", job_id)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!job) {
      return { content: [{ type: "text", text: "No job found with that id." }], isError: true };
    }

    let customer: unknown = null;
    if (job.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, eircode, boiler_make_model, boiler_type, under_warranty, access_notes")
        .eq("id", job.customer_id)
        .maybeSingle();
      customer = data ?? null;
    }

    const payload = { job, customer };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
