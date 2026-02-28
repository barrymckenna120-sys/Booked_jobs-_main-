import { Button } from "@/components/ui/button";
import { Check, Zap } from "lucide-react";
import { ScrollFadeIn } from "./ScrollFadeIn";

const included = [
  "24/7 online booking form",
  "Automatic renewal tracking",
  "WhatsApp quote sending",
  "Google review requests",
  "Full customer history",
  "Deposit & payment tracking",
];

export const PricingSection = () => {
  return (
    <section className="section-container py-10">
      <div className="bg-gradient-to-br from-primary/8 via-primary/5 to-accent/15 rounded-3xl p-8 lg:p-12 border border-primary/10">
        <ScrollFadeIn>
          <div className="text-center mb-8">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-4">
              Pricing
            </span>
            <h2 className="section-heading text-center">Simple, transparent pricing.</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              No setup fees. No contracts. Cancel anytime.
            </p>
          </div>
        </ScrollFadeIn>

        <ScrollFadeIn delay={0.1}>
          <div className="bg-background rounded-2xl p-8 shadow-md border border-border/60 max-w-md mx-auto relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-accent" />

            <div className="flex items-center justify-center gap-2 mb-6">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-primary uppercase tracking-wide">All-in-one plan</span>
            </div>

            <div className="text-center mb-6">
              <p className="text-5xl font-extrabold text-foreground">
                €200<span className="text-lg font-normal text-muted-foreground">/month</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">+ VAT</p>
            </div>

            <div className="space-y-3 mb-8">
              {included.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>

            <Button size="lg" className="w-full text-base font-semibold py-6 mb-4" asChild>
              <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                Start 14-Day Free Trial
              </a>
            </Button>

            <p className="text-center text-sm text-muted-foreground mb-3">
              One extra boiler service per month pays for the system.
            </p>

            <div className="text-center">
              <a href="/auth" className="text-sm font-semibold text-primary hover:underline">
                Login to your account
              </a>
            </div>
          </div>
        </ScrollFadeIn>
      </div>
    </section>
  );
};
