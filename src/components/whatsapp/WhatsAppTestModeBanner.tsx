import { FlaskConical } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { fetchProfile } from "@/lib/profileCache";

export default function WhatsAppTestModeBanner() {
  const { user } = useAuth();
  const { viewingOrgId } = useAdminViewAs();
  const userId = user?.id;
  const { data: testMode = false } = useQuery({
    queryKey: ["whatsapp-test-mode-banner", userId, viewingOrgId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return false;
      const profile = await fetchProfile(userId);
      const organisationId = viewingOrgId ?? profile.organisation_id;
      if (!organisationId) return false;
      const { data, error } = await supabase
        .from("organisations")
        .select("whatsapp_test_mode")
        .eq("id", organisationId)
        .maybeSingle();
      if (error) throw error;
      return data?.whatsapp_test_mode === true;
    },
  });

  if (!testMode) return null;

  return (
    <div className="flex w-full items-center justify-center gap-2 border-b border-warning/30 bg-warning/15 px-4 py-2.5 text-sm font-semibold text-foreground">
      <FlaskConical className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span>WhatsApp is in test mode. Messages only go to approved test numbers.</span>
    </div>
  );
}