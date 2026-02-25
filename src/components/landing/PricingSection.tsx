import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center">Simple pricing.</h2>

      <div className="bg-background rounded-xl p-8 shadow-sm border border-border max-w-md mx-auto">
        <div className="text-center mb-6">
          <p className="text-5xl font-bold text-cta">
            €200<span className="text-lg font-normal text-body">/month</span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">+ VAT</p>
        </div>

        <p className="text-center text-body font-medium mb-8">
          One extra boiler service per month pays for the system.
        </p>

        <Button size="lg" className="w-full text-base font-semibold py-6 mb-4" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Start 30-Day Trial →
          </a>
        </Button>

        <div className="text-center">
          <a href="/auth" className="text-sm font-semibold text-cta hover:underline">
            Login to your account
          </a>
        </div>
      </div>
    </section>
  );
};
