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
            Early Customer Rates
          </span>

          <h2 className="section-heading text-center mb-4">
            Lock in Early Customer Rates
          </h2>

          <p className="text-muted-foreground max-w-lg mx-auto text-base leading-relaxed mb-8">
            Early customer rates available exclusively for waitlist members. Join today and lock in your price before launch.
          </p>

        </div>
      </ScrollFadeIn>
    </section>
  );
};
