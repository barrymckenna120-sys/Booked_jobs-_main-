import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import engineerVanImg from "@/assets/engineer-van-tablet.png";
import { ScrollFadeIn } from "./ScrollFadeIn";

export const HeroSection = () => {
  const benefits = [
    "Customers can book a service anytime",
    "Automatic renewal reminders sent by WhatsApp",
    "Track quotes, payments and job history in one place",
  ];

  return (
    <section className="section-container pt-6 pb-6 lg:pt-10 lg:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left — Text block */}
        <ScrollFadeIn direction="up">
          <div className="max-w-xl">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.12em] text-primary bg-primary/8 px-3.5 py-1.5 rounded-full mb-6 border border-primary/15">
              Built for Boiler Service Companies
            </span>

            <h1 className="text-[2.25rem] lg:text-[2.75rem] xl:text-5xl font-extrabold text-foreground leading-[1.15] tracking-[-0.025em] mb-5">
              Stop Losing Boiler Service Work You've Already Earned
            </h1>

            <p className="text-muted-foreground text-[15px] lg:text-base leading-[1.7] mb-3.5">
              As your customer base grows, keeping up with annual renewals, quotes and payments gets harder.
            </p>

            <p className="text-muted-foreground text-[15px] lg:text-base leading-[1.7] mb-9">
              BookedJobs gives you a simple operations system to manage jobs, reminders and revenue — all from your phone.
            </p>

            <div className="space-y-3.5 mb-10">
              {benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
                  </div>
                  <span className="text-foreground text-sm font-semibold tracking-[-0.01em]">{benefit}</span>
                </div>
              ))}
            </div>

            <div className="max-w-[320px]">
              <Button size="lg" className="w-full text-[15px] font-bold py-6 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-shadow" asChild>
                <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                  Start 30-Day Free Trial
                </a>
              </Button>
              <p className="text-center text-[13px] text-muted-foreground mt-3.5 tracking-[-0.01em]">
                One extra boiler service per month pays for the system.
              </p>
            </div>
          </div>
        </ScrollFadeIn>

        {/* Right — Hero image */}
        <ScrollFadeIn direction="right" delay={0.15}>
          <div className="relative">
            <img
              src={engineerVanImg}
              alt="Professional gas boiler service engineer in van holding a tablet with the BookedJobs booking and renewal dashboard"
              className="relative w-full"
              loading="eager"
            />
          </div>
        </ScrollFadeIn>
      </div>
    </section>
  );
};
