import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchCustomersTool from "./tools/search-customers";
import listJobsTool from "./tools/list-jobs";
import getJobTool from "./tools/get-job";
import listQuotesTool from "./tools/list-quotes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "karls-gas-boilers-service-dev-app-24-02-2026",
  title: "karls gas boilers service  dev app 24/02/2026",
  version: "0.1.0",
  instructions:
    "Read-only tools for this gas boiler service business. Use `search_customers` to find a customer, `list_jobs` to browse scheduled or completed jobs, `get_job` for full job plus customer detail, and `list_quotes` for quote totals and status. All data is scoped to the signed-in user's organisation.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchCustomersTool, listJobsTool, getJobTool, listQuotesTool],
});
