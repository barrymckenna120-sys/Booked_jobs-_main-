import { createClient } from "npm:@supabase/supabase-js@2";
import { handle, type FaultDb } from "./handler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as unknown as FaultDb;

const allowedOrigins = (): string[] =>
  (Deno.env.get("PUBLIC_FAULT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

Deno.serve((req: Request) => handle(req, { db: supabase, allowedOrigins }));
