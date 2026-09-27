import { useState, useCallback, useEffect, useRef } from "react";
import { Monitor, Smartphone, ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { TourType } from "@/hooks/useOnboardingTour";
import OfficeTourDesktop from "@/components/onboarding/OfficeTourDesktop";
import TourFeedbackForm from "@/components/onboarding/TourFeedbackForm";
import { OFFICE_TOUR_STEPS, type OfficeTourStep } from "@/components/onboarding/officeTourSteps";
import { ENGINEER_TOUR_STEPS } from "@/components/onboarding/engineerTourSteps";

interface Props {
  open: boolean;
  tourType: TourType;
  userId: string;
  /** True when replayed from Help — feedback is tagged is_replay. */
  isReplay?: boolean;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  onClose: () => void;
}

type Phase = "intro" | "steps" | "feedback";

const OnboardingTour = ({ open, tourType, isReplay = false, onComplete, onSkip }: Props) => {
  const steps = tourType === "office" ? OFFICE_TOUR_STEPS : ENGINEER_TOUR_STEPS;
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);

  const isLastStep = stepIndex === steps.length - 1;
  const isOffice = tourType === "office";

  // Desktop (≥1024px) uses a centred dialog; below that the sheet is unchanged.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const useDesktopDialog = isDesktop;

  const handleStartTour = useCallback(() => {
    setPhase("steps");
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      setPhase("feedback");
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLastStep]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const handleFinish = useCallback(async () => {
    await onComplete();
    resetState();
  }, [onComplete]);

  const handleSkip = useCallback(async () => {
    await onSkip();
    resetState();
  }, [onSkip]);

  const resetState = () => {
    setPhase("intro");
    setStepIndex(0);
  };

  if (!open) return null;

  // Desktop office: dialog only; its final screen is the shared feedback form.
  if (useDesktopDialog) {
    return <OfficeTourDesktop tourType={tourType} isReplay={isReplay} steps={steps} onFinish={handleFinish} onSkip={handleSkip} />;
  }

  // ─── Intro Sheet ───
  if (phase === "intro") {
    const IntroIcon = isOffice ? Monitor : Smartphone;
    return (
      <Sheet maxHeight="56vh" backdrop={isOffice}>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: isOffice ? "#4A86E8" : "#22c55e" }}>
            <IntroIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-black" style={{ color: "#1a1a2e" }}>
            Welcome to BookedJobs
          </h2>
          <p className="text-[13px] leading-[1.7]" style={{ color: "#64748b" }}>
            {isOffice
              ? "Karl's Gas runs on BookedJobs. A quick 3-minute tour will show you the 7 things you'll use every day."
              : "Everything you need for your jobs is right here. A quick 2-minute tour to show you around."}
          </p>
          <button
            className="w-full rounded-[9px] py-[13px] text-sm font-bold text-white mt-2"
            style={{ backgroundColor: "#4A86E8", boxShadow: "0 2px 8px rgba(74,134,232,0.25)" }}
            onClick={handleStartTour}
          >
            Start Tour →
          </button>
          <button onClick={handleSkip} className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            Skip — I'll figure it out
          </button>
        </div>
      </Sheet>
    );
  }

  // ─── Feedback (final screen) ───
  if (phase === "feedback") {
    return (
      <Sheet maxHeight="56vh" backdrop={isOffice}>
        <TourFeedbackForm tourType={tourType} isReplay={isReplay} onDone={handleFinish} />
      </Sheet>
    );
  }

  // ─── Mobile step sheet (shared layout for both tours) ───
  return (
    <TourMobileStep
      steps={steps}
      index={stepIndex}
      onNext={handleNext}
      onBack={handleBack}
      onSkip={handleSkip}
    />
  );
};

// ─── Mobile step sheet (same layout as the office tour) ───
const TourMobileStep = ({ steps, index, onNext, onBack, onSkip }: { steps: OfficeTourStep[]; index: number; onNext: () => void; onBack: () => void; onSkip: () => void }) => {
  const step = steps[index];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext();
    else if (index > 0) onBack();
  };
  return (
    <>
      <div className="fixed inset-0 z-[99]" style={{ backgroundColor: "rgba(15,23,42,0.5)" }} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-tour-m-title"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="fixed bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-[560px] z-[100] w-full bg-card overflow-y-auto overscroll-contain motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300"
        style={{
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.10)",
          maxHeight: "88vh",
          padding: "12px 20px calc(20px + env(safe-area-inset-bottom)) 20px",
        }}
      >
        <div className="flex justify-center mb-3">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-border" style={{ backgroundColor: "#ffffff" }}>
          {step.hasImage ? (
            <img src={step.image} alt={step.alt} className="h-full w-full object-contain" />
          ) : (
            <div role="img" aria-label={step.alt} className="flex h-full w-full items-center justify-center bg-accent p-4 text-center text-sm font-medium text-primary">
              Screenshot: {step.label} — to be added
            </div>
          )}
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-primary">{step.number} · {step.label}</p>
        <h3 id="office-tour-m-title" className="mt-1.5 text-lg font-extrabold leading-tight text-foreground">{step.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
        <ul className="mt-3 space-y-1.5">
          {step.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
              <span className="text-[13px] font-semibold text-foreground">{b}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-center gap-1.5 mt-4" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <div
              key={s.id}
              className="h-1.5 rounded-full motion-safe:transition-all"
              style={{ width: i === index ? 20 : 8, backgroundColor: i === index ? "#4A86E8" : i < index ? "#bfdbfe" : "#e2e8f0" }}
            />
          ))}
          <Check className="w-3 h-3 text-muted-foreground" aria-label="Feedback" />
        </div>
        <div className="flex gap-2.5 mt-4">
          {index > 0 && (
            <button onClick={onBack} className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-[9px] border border-border bg-card text-[13px] font-semibold text-muted-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button onClick={onNext} className="flex-[2] min-h-[44px] flex items-center justify-center gap-1.5 rounded-[9px] bg-primary text-[13px] font-bold text-primary-foreground">
            Next <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button onClick={onSkip} className="block w-full min-h-[44px] text-xs text-center mt-1 text-muted-foreground">
          Skip tour
        </button>
      </div>
    </>
  );
};

// ─── Bottom Sheet wrapper ───
const Sheet = ({ children, maxHeight = "44vh", backdrop = false }: { children: React.ReactNode; maxHeight?: string; backdrop?: boolean }) => {
  // On md+ screens, cap at 320px (or 56vh equivalent for intro/feedback)
  const desktopMax = maxHeight === "56vh" ? "400px" : "320px";
  return (
    <>
    {backdrop && <div className="fixed inset-0 z-[99]" style={{ backgroundColor: "rgba(15,23,42,0.5)" }} aria-hidden="true" />}
    <div
      className="fixed bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-[560px] z-[100] bg-white overflow-y-auto animate-in slide-in-from-bottom duration-300"
      style={{
        borderRadius: "16px 16px 0 0",
        borderTop: "1px solid #e8edf2",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.10)",
        padding: "20px 20px 32px 20px",
        maxHeight: `min(${maxHeight}, ${desktopMax})`,
        width: "100%",
      }}
    >
      {/* Handle bar */}
      <div className="flex justify-center mb-4">
        <div className="w-9 h-1 rounded-full" style={{ backgroundColor: "#e2e8f0" }} />
      </div>
      {children}
    </div>
    </>
  );
};

export default OnboardingTour;
