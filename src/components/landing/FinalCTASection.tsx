import { Button } from "@/components/ui/button";
import { Check, Calendar, AlertTriangle } from "lucide-react";

export const FinalCTASection = () => {
  const benefits = [
    "Setup done for you",
    "Customers book you while you work",
    "Google profile fully optimised",
    "All updates handled monthly",
  ];

  return (
    <section className="section-container bg-primary/5">
      <h2 className="section-heading text-center">
        ✅ Ready to Stop Missing Jobs?
      </h2>
      
      <ul className="space-y-3 mb-6">
        {benefits.map((benefit, index) => (
          <li key={index} className="flex items-center gap-2 text-body">
            <Check className="w-5 h-5 text-success flex-shrink-0" />
            {benefit}
          </li>
        ))}
      </ul>
      
      <div className="bg-secondary rounded-lg p-4 mb-6 space-y-2">
        <p className="flex items-center gap-2 text-body">
          <Calendar className="w-5 h-5 text-primary" />
          Offer ends 31 Jan
        </p>
        <p className="flex items-center gap-2 text-body">
          <AlertTriangle className="w-5 h-5 text-warning" />
          4 plumber slots left at €200/month
        </p>
      </div>
      
      <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
        <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
          Start My Booking Setup →
        </a>
      </Button>
    </section>
  );
};
