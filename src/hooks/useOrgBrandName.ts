import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { resolveOrgBrandName } from "@/lib/orgBrandName";

/** Current tenant's display name ("" if none configured). Scoped by organisation_id. */
export function useOrgBrandName(): string {
  const { orgId } = useOrgId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const [{ data: s }, { data: o }] = await Promise.all([
        supabase.from("settings").select("business_name, company_name").eq("organisation_id", orgId).limit(1).maybeSingle(),
        supabase.from("organisations").select("name").eq("id", orgId).maybeSingle(),
      ]);
      if (cancelled) return;
      setName(
        resolveOrgBrandName({
          business_name: (s as any)?.business_name,
          company_name: (s as any)?.company_name,
          organisation_name: (o as any)?.name,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return name;
}
