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

const localKey = (userId: string) => `onboarding_tour_completed_${userId}`;

export const useOnboardingTour = (user: User | null): UseOnboardingTourReturn => {
  const { role, loading: roleLoading } = useUserRole(user);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [loading, setLoading] = useState(true);

  const tourType: TourType = role === "engineer" ? "engineer" : "office";

  // Read onboarding_complete from localStorage first, then profiles
  useEffect(() => {
    if (!user || roleLoading) return;

    // Check localStorage first — fast & reliable
    if (localStorage.getItem(localKey(user.id)) === "true") {
      setOnboardingComplete(true);
      setShowTour(false);
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("user_id", user.id)
        .maybeSingle();

      const complete = (data as any)?.onboarding_complete ?? false;
      setOnboardingComplete(complete);

      if (complete) {
        // Sync to localStorage so future checks are instant
        localStorage.setItem(localKey(user.id), "true");
      } else {
        setShowTour(true);
      }
      setLoading(false);
    };

    fetchStatus();
  }, [user, roleLoading]);

  const markComplete = useCallback(async () => {
    if (!user) return;
    // Always persist to localStorage (works even if DB update fails for engineers)
    localStorage.setItem(localKey(user.id), "true");
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

  const closeTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
  }, [markComplete]);

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
