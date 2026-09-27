import { useState } from "react";
import { Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TourType } from "@/hooks/useOnboardingTour";
import { submitTourFeedback, TOUR_COMMENT_MAX } from "@/lib/tourFeedback";

interface Props {
  tourType: TourType;
  isReplay: boolean;
  /** Called after a successful save or on skip — completes the tour as today. */
  onDone: () => void | Promise<void>;
  titleId?: string;
}

/** Final tour screen shared by the desktop dialog and the mobile/engineer sheet. */
const TourFeedbackForm = ({ tourType, isReplay, onDone, titleId }: Props) => {
  const [rating, setRating] = useState(0);
  const [clarity, setClarity] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const send = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      await submitTourFeedback({ tourType, rating, clarity, comment, isReplay });
    } catch (e) {
      console.error("tour feedback save failed", e);
      toast.error("Couldn't send your feedback. Please try again.");
      setSubmitting(false);
      return;
    }
    await onDone();
  };

  const clarityBtn = (value: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors",
      clarity === value ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground",
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 id={titleId} className="text-base font-extrabold text-foreground">How was the tour?</h2>
      </div>

      <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={rating === s}
            aria-label={`${s} star${s === 1 ? "" : "s"}`}
            onClick={() => setRating(s)}
            className="p-1 transition-transform hover:scale-110 motion-reduce:transition-none"
          >
            <Star className={cn("w-7 h-7", s <= rating ? "fill-amber-400 text-amber-400" : "text-border")} />
          </button>
        ))}
      </div>

      <div className="text-center">
        <p className="text-xs mb-2 text-muted-foreground">Easy to follow?</p>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => setClarity(true)} className={clarityBtn(true)}>
            <ThumbsUp className="w-4 h-4" /> Yes
          </button>
          <button type="button" onClick={() => setClarity(false)} className={clarityBtn(false)}>
            <ThumbsDown className="w-4 h-4" /> No
          </button>
        </div>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={TOUR_COMMENT_MAX}
        placeholder="Anything we should improve? (optional)"
        rows={2}
        aria-label="Comment (optional)"
        className="w-full min-h-[64px] rounded-lg border border-border bg-background p-2.5 text-xs resize-none"
      />

      <button
        type="button"
        disabled={rating === 0 || submitting}
        onClick={send}
        className="w-full min-h-[44px] rounded-lg bg-primary py-3 text-[13px] font-bold text-primary-foreground transition-colors disabled:bg-muted disabled:text-muted-foreground"
      >
        {submitting ? "Sending…" : "Send & finish"}
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => onDone()}
        className="min-h-[44px] text-xs text-center text-muted-foreground hover:text-foreground"
      >
        Skip &amp; finish
      </button>
    </div>
  );
};

export default TourFeedbackForm;
