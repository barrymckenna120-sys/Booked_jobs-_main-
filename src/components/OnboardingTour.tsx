import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { TourType } from "@/hooks/useOnboardingTour";
import {
  LayoutDashboard, Calendar, Inbox, Users, FileText, TrendingUp, Settings,
  Briefcase, MapPin, ClipboardList, Clock, Monitor, Smartphone,
  ArrowLeft, ArrowRight, Check
} from "lucide-react";
import OfficeTourDesktop from "@/components/onboarding/OfficeTourDesktop";
import TourFeedbackForm from "@/components/onboarding/TourFeedbackForm";

// ─── Step definitions ───

interface TourStep {
  id: string;
  title: string;
  desc: string;
  icon: any;
  route: string;
  isSettings?: boolean;
  tab?: string;
}

const OFFICE_STEPS: TourStep[] = [
  { id: "dashboard", title: "Dashboard", desc: "Your daily command centre. See today's schedule, revenue broken down by Cash and Card, and the Needs Attention section which flags new incoming jobs and renewals due soon.", icon: LayoutDashboard, route: "/dashboard" },
  { id: "schedule", title: "Schedule", desc: "Weekly calendar across all engineers. Tap any job card to open the detail panel where you can mark it complete, move the slot, reassign the engineer or cancel.", icon: Calendar, route: "/schedule" },
  { id: "incoming", title: "Incoming Jobs", desc: "New job requests land here automatically when a customer fills in the customer booking form. Colour-coded by wait time — accept a job to move it straight to the schedule.", icon: Inbox, route: "/incoming" },
  { id: "customers", title: "Customer Profiles", desc: "Search by name, phone, eircode or area code. Every profile holds contact info, boiler details, service history and WhatsApp history — everything you need before a job or a call.", icon: Users, route: "/customers" },
  { id: "quotes", title: "Quotes", desc: "Create a quote with job description, parts and price. Send it to the customer via WhatsApp. When they accept, convert it to a job in one tap.", icon: FileText, route: "/quotes" },
  { id: "finance", title: "Finance", desc: "Switch between Day, Week and Month to see revenue, outstanding balance and jobs completed. Next Month Forecast shows scheduled jobs plus renewals due so you always know what's coming in.", icon: TrendingUp, route: "/finance" },
  { id: "settings-overview", title: "Settings", desc: "Everything Karl needs to configure is here — business logo and details in General, engineer working days and holidays in Engineers, team access and login invites in Team, opening hours and job time blocks in Business, and customer message templates in WhatsApp.", icon: Settings, route: "/settings", isSettings: true, tab: "General" },
];

const ENGINEER_STEPS: TourStep[] = [
  { id: "eng-jobs", title: "Your Jobs for Today", desc: "All your jobs are listed here with customer name, address, time slot and job type. Amber flags mean the office has left you a note — check those before you set off.", icon: Briefcase, route: "/engineer/today" },
  { id: "eng-jobcard", title: "Job Details & Status", desc: "Tap a job to see the boiler, access notes, payment status and last service. Hit En Route when you leave, then Start Job when you arrive — the office sees your status live.", icon: MapPin, route: "/engineer/today" },
  { id: "eng-notes", title: "Notes, Messages & Access", desc: "The Access Note has gate codes and parking info. Add site notes and photos, message the office using preset chips, and see the full call notes history between you and the office.", icon: ClipboardList, route: "/engineer/today" },
  { id: "eng-history", title: "Customer History & Boiler", desc: "Tap the customer name for their full service history and boiler details — useful for knowing exactly what was done last time before you knock on the door.", icon: Clock, route: "/engineer/today" },
];

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
  const navigate = useNavigate();
  const steps = tourType === "office" ? OFFICE_STEPS : ENGINEER_STEPS;
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const totalSteps = steps.length;
  const isOffice = tourType === "office";

  // Desktop (≥1024px) office tour uses a centred dialog; below that the sheet is unchanged.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const useDesktopDialog = isOffice && isDesktop;

  // Navigate to the current step's route when step changes (sheet flow only)
  useEffect(() => {
    if (!useDesktopDialog && phase === "steps" && currentStep?.route) {
      navigate(currentStep.route);
    }
  }, [useDesktopDialog, phase, stepIndex, currentStep?.route, navigate]);

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
    return <OfficeTourDesktop tourType={tourType} isReplay={isReplay} onFinish={handleFinish} onSkip={handleSkip} />;
  }

  // ─── Intro Sheet ───
  if (phase === "intro") {
    const IntroIcon = isOffice ? Monitor : Smartphone;
    return (
      <Sheet maxHeight="56vh">
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
      <Sheet maxHeight="56vh">
        <TourFeedbackForm tourType={tourType} isReplay={isReplay} onDone={handleFinish} />
      </Sheet>
    );
  }

  // ─── Step Content ───
  const StepIcon = currentStep.icon;

  return (
    <Sheet>
      <div className="flex flex-col gap-0">
        {/* Title row */}
        <div className="flex items-center gap-2.5">
          <StepIcon className="w-5 h-5 shrink-0" style={{ color: "#4A86E8" }} />
          <h3 className="text-[15px] font-extrabold leading-tight" style={{ color: "#1a1a2e" }}>{currentStep.title}</h3>
        </div>

        {/* Description */}
        <p className="text-[13px] leading-[1.7] mt-2" style={{ color: "#64748b" }}>{currentStep.desc}</p>

        {currentStep.isSettings && (
          <div className="mt-2 rounded-lg p-2 text-xs font-medium" style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#4A86E8" }}>
            Tour navigated to Settings → {currentStep.tab}
          </div>
        )}

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === stepIndex ? 20 : 8,
                backgroundColor: i === stepIndex ? "#4A86E8" : i < stepIndex ? "#bfdbfe" : "#e2e8f0",
              }}
            />
          ))}
          <Check className="w-3 h-3 text-muted-foreground" aria-label="Feedback" />
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-2.5 mt-3.5 md:justify-end">
          {stepIndex > 0 && (
            <button
              className="flex-1 md:flex-none md:min-w-[100px] flex items-center justify-center gap-1.5 rounded-[9px] py-3 md:py-[10px] md:px-5 text-[13px] font-semibold"
              style={{ border: "1px solid #e2e8f0", color: "#64748b", backgroundColor: "white" }}
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            className="flex-[2] md:flex-none md:min-w-[140px] flex items-center justify-center gap-1.5 rounded-[9px] py-3 md:py-[10px] md:px-6 text-[13px] font-bold text-white"
            style={{ backgroundColor: "#4A86E8", boxShadow: "0 2px 8px rgba(74,134,232,0.25)" }}
            onClick={handleNext}
          >
            <>Next <ArrowRight className="w-4 h-4" /></>
          </button>
        </div>

        {/* Skip link */}
        <button onClick={handleSkip} className="text-xs text-center mt-3.5 pb-safe md:text-right md:mt-4" style={{ color: "#94a3b8" }}>
          Skip tour
        </button>
      </div>
    </Sheet>
  );
};

// ─── Bottom Sheet wrapper ───
const Sheet = ({ children, maxHeight = "44vh" }: { children: React.ReactNode; maxHeight?: string }) => {
  // On md+ screens, cap at 320px (or 56vh equivalent for intro/feedback)
  const desktopMax = maxHeight === "56vh" ? "400px" : "320px";
  return (
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
  );
};

export default OnboardingTour;
