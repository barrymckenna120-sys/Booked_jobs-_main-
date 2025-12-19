import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Shield } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";

export const FinalCTASection = () => {
  const benefits = [
    "24/7 booking system installed",
    "Google profile fully optimised",
    "Lead capture that works while you're working",
  ];

  return (
    <section className="section-container bg-cta/5">
      <h2 className="section-heading text-center flex items-center justify-center gap-2">
        <Shield className="w-8 h-8 text-cta" />
        Stop Losing Bookings. Protect Your Revenue.
      </h2>
      
      <ul className="space-y-3 mb-6">
        {benefits.map((benefit, index) => (
          <li key={index} className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-cta flex-shrink-0" />
            {benefit}
          </li>
        ))}
      </ul>
      
      <div className="bg-secondary rounded-lg p-4 mb-6 space-y-3">
        <p className="text-center text-sm font-medium text-foreground mb-3">Offer ends 31 Jan</p>
        <CountdownTimer />
        <p className="flex items-center justify-center gap-2 text-body mt-3">
          <AlertTriangle className="w-5 h-5 text-cta" />
          Only 4 plumber slots left
        </p>
      </div>
      
      <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
        <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
          Start My Booking System Setup →
        </a>
      </Button>
    </section>
  );
};
