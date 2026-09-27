import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  isReplay: boolean;
  loading: boolean;
}

const localKey = (userId: string) => `onboarding_tour_completed_${userId}`;

export const useOnboardingTour = (user: User | null, layout: TourType): UseOnboardingTourReturn => {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [loading, setLoading] = useState(true);

  // Tour type follows the app the user is in, never their role.
  const tourType: TourType = layout;

  // Read onboarding_complete from localStorage first, then profiles
  useEffect(() => {
    if (!user) return;

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
  }, [user]);

  // A replay (from Help) is local-only: finishing/skipping it never writes again.
  const [isReplay, setIsReplay] = useState(false);

  const markComplete = useCallback(async () => {
    if (!user || isReplay) return;
    // Always persist to localStorage (works even if DB update fails for engineers)
    localStorage.setItem(localKey(user.id), "true");
    await supabase
      .from("profiles")
      .update({ onboarding_complete: true } as any)
      .eq("user_id", user.id);
    setOnboardingComplete(true);
  }, [user, isReplay]);

  const completeTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
    setIsReplay(false);
  }, [markComplete]);

  const skipTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
    setIsReplay(false);
  }, [markComplete]);

  const startTour = useCallback(() => {
    setIsReplay(true);
    setShowTour(true);
  }, []);

  const closeTour = useCallback(async () => {
    await markComplete();
    setShowTour(false);
    setIsReplay(false);
  }, [markComplete]);

  return {
    shouldShowTour: onboardingComplete === false,
    tourType,
    showTour,
    startTour,
    completeTour,
    skipTour,
    closeTour,
    isReplay,
    loading,
  };
};
