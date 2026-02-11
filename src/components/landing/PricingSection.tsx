import { Button } from "@/components/ui/button";
import { Check, Flame } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center">Simple, Transparent Pricing</h2>
      
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-2 bg-cta text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg">
          <Flame className="w-4 h-4" />
          Limited Offer — First 10 Sign-Ups Only
          <Flame className="w-4 h-4" />
        </span>
      </div>

      <div className="bg-background rounded-xl p-8 shadow-sm border border-border max-w-md mx-auto">
        <ul className="space-y-3 mb-8">
          <li className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            No Setup Fee
          </li>
          <li className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            30-Day Free Trial
          </li>
        </ul>

        <div className="text-center pt-6 border-t border-border mb-4">
          <p className="text-5xl font-bold text-cta">€200<span className="text-lg font-normal text-body">/month</span></p>
          <p className="text-sm text-muted-foreground mt-1">+ VAT (23%)</p>
          <p className="text-sm text-muted-foreground">after trial</p>
        </div>

        <div className="flex justify-center mb-8">
          <span className="inline-flex items-center gap-2 text-cta font-semibold">
            <Check className="w-5 h-5 flex-shrink-0" />
            Cancel Anytime
          </span>
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