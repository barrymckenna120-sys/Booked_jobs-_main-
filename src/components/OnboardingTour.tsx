import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TourType } from "@/hooks/useOnboardingTour";
import {
  LayoutDashboard, Calendar, Inbox, Users, FileText, TrendingUp, Settings,
  Briefcase, MapPin, ClipboardList, Clock, Monitor, Smartphone,
  ArrowLeft, ArrowRight, CheckCircle, Star, ThumbsUp, ThumbsDown, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Step definitions ───

interface TourStep {
  id: string;
  title: string;
  desc: string;
  icon: any;
  route?: string;
  isSettings?: boolean;
  tab?: string;
}

const OFFICE_STEPS: TourStep[] = [
  { id: "dashboard", title: "Dashboard", desc: "Your daily command centre. Today's Schedule links to the full week view. Today's Revenue shows a Day/Week/Month toggle with Card and Cash split. The Needs Attention section flags new incoming jobs, overdue services and renewals due soon — so nothing gets missed.", icon: LayoutDashboard, route: "/dashboard" },
  { id: "schedule", title: "Schedule", desc: "Weekly calendar across all engineers. Each job card shows the customer, job type, price and a Message button. Tap any job to open the detail panel — view full job info, then Mark Complete, Move Slot, Reassign or Cancel.", icon: Calendar, route: "/schedule" },
  { id: "incoming", title: "Incoming Jobs", desc: "New job requests land here automatically when a customer fills in the customer booking form. Colour-coded by how long they've been waiting — red means urgent. Accept a job to move it straight onto the schedule.", icon: Inbox, route: "/incoming" },
  { id: "customers", title: "Customer Profiles", desc: "Search by name, phone, eircode or area code. Every profile holds contact info, boiler details, access notes, WhatsApp history, payment history and a full service history table — everything in one place before a job or call.", icon: Users, route: "/customers" },
  { id: "quotes", title: "Quotes", desc: "Create a quote with job description, parts and price. Save as Draft or send directly to the customer via WhatsApp. Stat cards at the top show total, open, accepted and paid values. When a quote is accepted, convert it to a job in one tap.", icon: FileText, route: "/quotes" },
  { id: "finance", title: "Finance", desc: "Switch between Day, Week and Month or pick any date range. See revenue, outstanding balance, jobs completed and average job value. Payment breakdown splits Cash, Card and Invoice. Next Month Forecast shows scheduled jobs plus renewals due so you always know what's coming in.", icon: TrendingUp, route: "/finance" },
  { id: "settings-overview", title: "Settings — Your Business", desc: "Settings covers everything Karl needs to configure. General has the business logo, name and contact details. Engineers lets you set working days and block holidays per engineer. Team is where you add new users, set roles and send login invites. Business sets opening hours, service areas and job time blocks. WhatsApp holds the message templates sent to customers.", icon: Settings, route: "/settings", isSettings: true, tab: "General" },
];

const ENGINEER_STEPS: TourStep[] = [
  { id: "eng-jobs", title: "Your Jobs for Today", desc: "All your jobs are here with customer name, address, time slot and job type. Amber flags mean the office has left you a note — check those before you set off.", icon: Briefcase, route: "/jobs" },
  { id: "eng-jobcard", title: "Job Details & Status", desc: "Tap a job to see everything — boiler, access notes, payment and last service. Hit En Route when you leave, then Start Job when you arrive — the office sees your status live.", icon: MapPin },
  { id: "eng-notes", title: "Notes, Messages & Access", desc: "The Access Note has gate codes, parking and anything you need to get in. Add site notes and photos here, message the office using preset chips, and see the full call notes history between you and the office.", icon: ClipboardList },
  { id: "eng-history", title: "Customer History & Boiler", desc: "Tap the customer name for their full service history and boiler details. Useful for knowing exactly what was done last time before you knock on the door.", icon: Clock },
];

interface Props {
  open: boolean;
  tourType: TourType;
  userId: string;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  onClose: () => void;
}

type Phase = "intro" | "steps" | "feedback" | "thanks";

const OnboardingTour = ({ open, tourType, userId, onComplete, onSkip, onClose }: Props) => {
  const steps = tourType === "office" ? OFFICE_STEPS : ENGINEER_STEPS;
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);

  // Feedback state
  const [rating, setRating] = useState(0);
  const [clarity, setClarity] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const totalSteps = steps.length;
  const isOffice = tourType === "office";

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

  const handleSkipFeedback = useCallback(async () => {
    await onComplete();
    resetState();
  }, [onComplete]);

  const resetState = () => {
    setPhase("intro");
    setStepIndex(0);
    setRating(0);
    setClarity(null);
    setComment("");
  };

  const handleSubmitFeedback = async () => {
    setSubmitting(true);
    await supabase.from("onboarding_feedback").insert({
      user_id: userId,
      tour_type: tourType,
      rating,
      clarity,
      comment: comment.trim() || null,
    } as any);
    setSubmitting(false);
    setPhase("thanks");
  };

  if (!open) return null;

  // ─── Intro Slide ───
  if (phase === "intro") {
    const IntroIcon = isOffice ? Monitor : Smartphone;
    return (
      <Backdrop>
        <div className="bg-white rounded-xl max-w-md w-full mx-4 p-8 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-[#4A86E8] flex items-center justify-center">
            <IntroIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-extrabold text-[#1a1a2e]">
            {isOffice ? "Welcome to BookedJobs" : "Welcome, let's get you started"}
          </h2>
          <p className="text-sm text-[#64748b] leading-relaxed">
            {isOffice
              ? "Karl's Gas runs on BookedJobs. Let's take 3 minutes to show you the 7 things you'll use every day."
              : "Everything you need for your jobs is here. Quick 2-minute tour to show you around."}
          </p>
          <Button
            className="w-full h-12 font-bold text-base gap-2"
            style={{ backgroundColor: "#4A86E8" }}
            onClick={() => setPhase("steps")}
          >
            Start Tour <ArrowRight className="w-4 h-4" />
          </Button>
          <button onClick={handleSkip} className="text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors">
            Skip — I'll figure it out
          </button>
        </div>
      </Backdrop>
    );
  }

  // ─── Thanks State ───
  if (phase === "thanks") {
    return (
      <Backdrop>
        <div className="bg-white rounded-xl max-w-md w-full mx-4 p-8 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-200">
          <CheckCircle className="w-12 h-12 text-emerald-500" />
          <h2 className="text-xl font-extrabold text-[#1a1a2e]">Thanks for your feedback!</h2>
          <p className="text-sm text-[#64748b]">It helps Karl improve BookedJobs for the whole team.</p>
          <Button
            className="w-full h-11 font-bold"
            style={{ backgroundColor: "#4A86E8" }}
            onClick={handleFinish}
          >
            Close
          </Button>
        </div>
      </Backdrop>
    );
  }

  // ─── Feedback Form ───
  if (phase === "feedback") {
    return (
      <Backdrop>
        <div className="bg-white rounded-xl max-w-md w-full mx-4 p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center">
            <h2 className="text-lg font-extrabold text-[#1a1a2e]">How was the tour?</h2>
            <p className="text-xs text-[#94a3b8] mt-1">Takes 30 seconds. Goes straight to Karl.</p>
          </div>

          {/* Star rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)} className="transition-transform hover:scale-110">
                <Star
                  className={`w-8 h-8 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-[#e2e8f0]"}`}
                />
              </button>
            ))}
          </div>

          {/* Clarity */}
          <div className="text-center">
            <p className="text-sm text-[#64748b] mb-2">Was it clear and easy to follow?</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setClarity(true)}
                className={`p-3 rounded-lg border transition-colors ${clarity === true ? "bg-emerald-50 border-emerald-300 text-emerald-600" : "border-[#e2e8f0] text-[#94a3b8] hover:border-[#94a3b8]"}`}
              >
                <ThumbsUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => setClarity(false)}
                className={`p-3 rounded-lg border transition-colors ${clarity === false ? "bg-red-50 border-red-300 text-red-500" : "border-[#e2e8f0] text-[#94a3b8] hover:border-[#94a3b8]"}`}
              >
                <ThumbsDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Couldn't find the WhatsApp templates..."
            rows={3}
            className="text-sm"
          />

          <Button
            className="w-full h-11 font-bold"
            style={{ backgroundColor: rating > 0 ? "#4A86E8" : "#e2e8f0", color: rating > 0 ? "white" : "#94a3b8" }}
            disabled={rating === 0 || submitting}
            onClick={handleSubmitFeedback}
          >
            Submit Feedback
          </Button>

          <button onClick={handleSkipFeedback} className="text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors text-center">
            Skip feedback
          </button>
        </div>
      </Backdrop>
    );
  }

  // ─── Step Content ───
  const StepIcon = currentStep.icon;

  return (
    <Backdrop>
      <div className={`bg-white flex flex-col fixed inset-0 md:relative md:inset-auto md:rounded-xl md:max-h-[90vh] ${isOffice ? "md:max-w-[900px]" : "md:max-w-[500px]"} md:w-full md:mx-4 animate-in fade-in zoom-in-95 duration-200`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e8edf2] bg-white md:rounded-t-xl shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#4A86E8] flex items-center justify-center shrink-0">
            {isOffice ? <Monitor className="w-4 h-4 text-white" /> : <Smartphone className="w-4 h-4 text-white" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1a1a2e] truncate">{isOffice ? "Office Tour" : "Engineer Tour"}</p>
            <p className="text-xs text-[#94a3b8]">Step {stepIndex + 1} of {totalSteps} · {currentStep.title}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-md hover:bg-gray-100 text-[#94a3b8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb (tablet/desktop) */}
        <div className="hidden md:flex items-center justify-between px-4 py-1.5 bg-[#f1f5f9] text-xs shrink-0">
          <span className="text-[#4A86E8] font-medium">
            {currentStep.isSettings ? `Settings → ${currentStep.tab}` : currentStep.route}
          </span>
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">← Tour navigated here</span>
        </div>

        {/* Body */}
        <div className={`flex-1 overflow-y-auto flex ${isOffice ? "md:flex-row" : "md:flex-row"} flex-col`}>
          {/* Mock area (tablet/desktop only) */}
          <div className={`hidden md:flex items-center justify-center bg-[#f1f5f9] ${isOffice ? "flex-1" : "w-[240px] shrink-0"}`}>
            <div className="flex flex-col items-center gap-3 p-8">
              <StepIcon className="w-12 h-12 text-[#4A86E8]" />
              <span className="text-sm font-semibold text-[#64748b]">{currentStep.title}</span>
              {currentStep.route && (
                <span className="text-xs text-[#94a3b8] bg-white px-3 py-1 rounded-full border border-[#e8edf2]">{currentStep.route}</span>
              )}
            </div>
          </div>

          {/* Info panel */}
          <div className={`flex-1 ${isOffice ? "md:w-[280px] md:flex-none" : ""} bg-[#f8fafc] p-4 flex flex-col gap-4`}>
            {/* Mobile step icon */}
            <div className="flex items-center gap-3 md:hidden">
              <div className="w-10 h-10 rounded-xl bg-[#4A86E8]/10 flex items-center justify-center">
                <StepIcon className="w-5 h-5 text-[#4A86E8]" />
              </div>
              <span className="bg-[#4A86E8] text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Step {stepIndex + 1} of {totalSteps}</span>
            </div>

            {/* Step badge (desktop) */}
            <div className="hidden md:flex items-center gap-2">
              <span className="bg-[#4A86E8] text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Step {stepIndex + 1} of {totalSteps}</span>
              {currentStep.isSettings && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full">Settings → {currentStep.tab}</span>
              )}
            </div>

            {/* Step card */}
            <div className="bg-white rounded-[10px] p-3.5 border border-[#e8edf2] shadow-[0_1px_4px_rgba(0,0,0,0.07)]">
              <div className="hidden md:block mb-2">
                <StepIcon className="w-5 h-5 text-[#4A86E8]" />
              </div>
              <h3 className="text-[15px] font-extrabold text-[#1a1a2e] leading-tight mb-2">{currentStep.title}</h3>
              <p className="text-xs text-[#64748b] leading-relaxed">{currentStep.desc}</p>
              {currentStep.isSettings && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-[#4A86E8] font-medium">
                  ← Tour navigated to Settings → {currentStep.tab} automatically
                </div>
              )}
            </div>

            {/* Spacer on mobile to push buttons down */}
            <div className="flex-1" />

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === stepIndex ? "w-5 bg-[#4A86E8]" : i < stepIndex ? "w-2 bg-[#bfdbfe]" : "w-2 bg-[#e2e8f0]"
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <Button variant="outline" className="flex-1 gap-1.5 border-[#e2e8f0] text-[#64748b]" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              )}
              <Button
                className="flex-1 gap-1.5 font-bold"
                style={{ backgroundColor: "#4A86E8" }}
                onClick={handleNext}
              >
                {isLastStep ? (
                  <><CheckCircle className="w-4 h-4" /> Finish Tour</>
                ) : (
                  <>Next <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>

            {/* Skip link */}
            <button onClick={handleSkip} className="text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors text-center pb-safe">
              Skip tour
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};

// Backdrop wrapper
const Backdrop = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
    {children}
  </div>
);

export default OnboardingTour;
