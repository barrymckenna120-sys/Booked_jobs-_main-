import { Button } from "@/components/ui/button";
import { ScrollFadeIn } from "./ScrollFadeIn";
import { Sparkles } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container py-10">
      <ScrollFadeIn>
        <div className="bg-gradient-to-br from-primary/8 via-primary/5 to-accent/15 rounded-3xl p-8 lg:p-12 border border-primary/10 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            Early Access Pricing
          </span>

          <h2 className="section-heading text-center mb-4">
            Lock in Founding Member Rates
          </h2>

          <p className="text-muted-foreground max-w-lg mx-auto text-base leading-relaxed mb-8">
            Founding member rates available exclusively for waitlist members. Join today to lock in your price before launch.
          </p>

          <div className="max-w-xs mx-auto">
            <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
              <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                Join the Waitlist
              </a>
            </Button>
          </div>
        </div>
      </ScrollFadeIn>
    </section>
  );
};
