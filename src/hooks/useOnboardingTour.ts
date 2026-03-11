import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import type { User } from "@supabase/supabase-js";

export type TourType = "office" | "engineer";

interface UseOnboardingTourReturn {
  shouldShowTour: boolean;
  tourType: TourType;
  showTour: boolean;
  startTour: () => void;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  closeTour: () => void;
  loading: boolean;
}

export const useOnboardingTour = (user: User | null): UseOnboardingTourReturn => {
  const { role, loading: roleLoading } = useUserRole(user);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [loading, setLoading] = useState(true);

  const tourType: TourType = role === "engineer" ? "engineer" : "office";

  // Read onboarding_complete from profiles
  useEffect(() => {
    if (!user || roleLoading) return;

    const fetchStatus = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("user_id", user.id)
        .maybeSingle();

      const complete = (data as any)?.onboarding_complete ?? false;
      setOnboardingComplete(complete);

      // Auto-launch if not complete
      if (!complete) {
        setShowTour(true);
      }
      setLoading(false);
    };

    fetchStatus();
  }, [user, roleLoading]);

  const markComplete = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ onboarding_complete: true } as any)
      .eq("user_id", user.id);
    setOnboardingComplete(true);
  }, [user]);

  const completeTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
  }, [markComplete]);

  const skipTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
  }, [markComplete]);

  const startTour = useCallback(() => {
    setShowTour(true);
  }, []);

  const closeTour = useCallback(() => {
    setShowTour(false);
  }, []);

  return {
    shouldShowTour: onboardingComplete === false,
    tourType,
    showTour,
    startTour,
    completeTour,
    skipTour,
    closeTour,
    loading,
  };
};
