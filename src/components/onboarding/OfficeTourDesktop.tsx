import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { OFFICE_TOUR_STEPS } from "./officeTourSteps";
import TourFeedbackForm from "./TourFeedbackForm";
import type { TourType } from "@/hooks/useOnboardingTour";

interface Props {
  tourType: TourType;
  isReplay: boolean;
  onFinish: () => void;
  onSkip: () => void;
}

/** Desktop (≥1024px) office tour: centred dialog over the live app. Never navigates. */
const OfficeTourDesktop = ({ tourType, isReplay, onFinish, onSkip }: Props) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const steps = OFFICE_TOUR_STEPS;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const next = steps[index + 1];

  // Preload the next image only when it actually exists.
  useEffect(() => {
    if (next?.hasImage) {
      const img = new Image();
      img.src = next.image;
    }
  }, [next]);

  const goNext = () => (isLast ? setShowFeedback(true) : setIndex((i) => i + 1));
  const goBack = () => setIndex((i) => Math.max(0, i - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (showFeedback || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") { e.preventDefault(); if (!isLast) setIndex((i) => i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[rgba(15,23,42,0.5)] motion-safe:animate-in motion-safe:fade-in-0" />
        <DialogPrimitive.Content
          aria-labelledby={showFeedback ? "office-tour-feedback-title" : "office-tour-title"}
          aria-describedby={showFeedback ? undefined : "office-tour-body"}
          onKeyDown={onKeyDown}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-48px)] max-w-[960px] max-h-[calc(100vh-48px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
        >
          <div className="flex items-start justify-between gap-4">
            <div role="tablist" aria-label="Tour steps" className="flex flex-wrap gap-2">
              {steps.map((s, i) => {
                const active = !showFeedback && i === index;
                return (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setShowFeedback(false); setIndex(i); }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <span className="font-mono mr-1.5">{s.number}</span>{s.label}
                  </button>
                );
              })}
              <span
                aria-label="Feedback"
                className={cn(
                  "flex items-center rounded-lg border px-2 py-1.5",
                  showFeedback ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
            <button
              onClick={onSkip}
              className="shrink-0 whitespace-nowrap py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Skip tour
            </button>
          </div>

          {showFeedback ? (
            <div className="mx-auto mt-8 mb-2 w-full max-w-[420px]">
              <DialogPrimitive.Title className="sr-only">Tour feedback</DialogPrimitive.Title>
              <TourFeedbackForm tourType={tourType} isReplay={isReplay} onDone={onFinish} titleId="office-tour-feedback-title" />
            </div>
          ) : (<>
          <div className="mt-6 grid grid-cols-[55%_1fr] gap-8 items-center">
            <div className="aspect-[16/10] overflow-hidden rounded-xl shadow-md bg-accent">
              {step.hasImage ? (
                <img src={step.image} alt={step.alt} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div role="img" aria-label={step.alt} className="flex h-full w-full items-center justify-center p-6 text-center text-sm font-medium text-primary">
                  Screenshot: {step.label} — to be added
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                {step.number} · {step.label}
              </p>
              <DialogPrimitive.Title id="office-tour-title" className="mt-2 text-2xl font-extrabold text-foreground">
                {step.title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description id="office-tour-body" className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </DialogPrimitive.Description>
              <ul className="mt-5 space-y-3">
                {step.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-sm font-semibold text-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-5">
            {index > 0 && (
              <button
                onClick={goBack}
                className="flex min-w-[100px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button
              onClick={goNext}
              className="flex min-w-[140px] items-center justify-center gap-1.5 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          </>)}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default OfficeTourDesktop;
