import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const HeroSection = () => {
  const benefits = [
    "Customers can book a service anytime",
    "Automatic renewal reminders sent by WhatsApp",
    "Track quotes, payments and job history in one place",
  ];

  return (
    <section className="section-container pt-10 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        {/* Left — Text block */}
        <div>
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-5">
            Built for Boiler Service Companies
          </span>

          <h1 className="text-3xl lg:text-4xl font-extrabold text-foreground leading-tight mb-5">
            Stop Losing Boiler Service Work You've Already Earned
          </h1>

          <p className="text-muted-foreground text-base lg:text-lg leading-relaxed mb-4">
            As your customer base grows, keeping up with annual renewals, quotes and payments gets harder.
          </p>

          <p className="text-muted-foreground text-base leading-relaxed mb-8">
            BookedJobs gives you a simple operations system to manage jobs, reminders and revenue — all from your phone.
          </p>

          <div className="space-y-3 mb-8">
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-primary flex-shrink-0" strokeWidth={2.5} />
                <span className="text-foreground text-sm font-medium">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="max-w-sm">
            <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
              <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                Start 30-Day Free Trial
              </a>
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-3">
              One extra boiler service per month pays for the system.
            </p>
          </div>
        </div>

        {/* Right — Hero image */}
        <div className="relative">
          <img
            src="/images/hero-engineer-van.png"
            alt="Professional gas boiler service engineer in van holding a tablet with the BookedJobs booking and renewal dashboard"
            className="w-full rounded-2xl shadow-lg"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
};