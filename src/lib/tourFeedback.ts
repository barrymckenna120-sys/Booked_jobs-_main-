import { supabase } from "@/integrations/supabase/client";
import type { TourType } from "@/hooks/useOnboardingTour";

export const TOUR_COMMENT_MAX = 1000;

export type TourFeedbackInput = {
  tourType: TourType;
  rating: number;
  clarity: boolean | null;
  comment: string;
  isReplay: boolean;
};

export const tourDevice = (): "mobile" | "desktop" =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "desktop" : "mobile";

/** Row sent to onboarding_feedback. organisation_id / user_id / role are stamped server-side. */
export function buildTourFeedbackRow(id: string, input: TourFeedbackInput, device: "mobile" | "desktop") {
  const comment = input.comment.trim().slice(0, TOUR_COMMENT_MAX);
  return {
    id,
    tour_type: input.tourType,
    device,
    rating: input.rating,
    clarity: input.clarity,
    comment: comment || null,
    is_replay: input.isReplay,
  };
}

/**
 * Saves feedback. The id is generated client-side because tenant users cannot
 * read the table back (superadmin-only SELECT). Throws on failure.
 * The admin email is fire-and-forget and never affects the save.
 */
export async function submitTourFeedback(input: TourFeedbackInput): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("onboarding_feedback")
    .insert(buildTourFeedbackRow(id, input, tourDevice()) as never);
  if (error) throw error;
  supabase.functions
    .invoke("notify-tour-feedback", { body: { feedback_id: id } })
    .catch((e) => console.warn("notify-tour-feedback failed", e));
  return id;
}
