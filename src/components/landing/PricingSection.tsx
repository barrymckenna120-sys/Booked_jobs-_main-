import { Button } from "@/components/ui/button";
import { Check, Zap } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center">Simple, Transparent Pricing</h2>
      
      <div className="bg-background rounded-xl p-8 shadow-sm border border-border max-w-md mx-auto">
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 bg-cta/10 text-cta px-4 py-2 rounded-full text-sm font-medium">
            <Zap className="w-4 h-4" />
            Start Free — No Card Required
          </span>
        </div>

        <ul className="space-y-3 mb-8">
          <li className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            No Setup Fee
          </li>
          <li className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            30-Day Free Trial
          </li>
          <li className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            Cancel Anytime
          </li>
        </ul>

        <div className="text-center pt-6 border-t border-border mb-8">
          <p className="text-5xl font-bold text-cta">€200<span className="text-lg font-normal text-body">/month</span></p>
          <p className="text-sm text-muted-foreground mt-1">after trial</p>
        </div>

        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Start My Free Trial →
          </a>
        </Button>
      </div>
    </section>
  );
};
