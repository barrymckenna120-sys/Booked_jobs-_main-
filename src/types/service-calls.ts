import type { Database } from "@/integrations/supabase/types";

export type ServiceCall = Database["public"]["Tables"]["service_calls"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];