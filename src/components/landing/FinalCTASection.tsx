import { Button } from "@/components/ui/button";

export const FinalCTASection = () => {
  return (
    <section className="section-container bg-cta/5 py-12">
      <h2 className="section-heading text-center">
        Stop letting jobs fall through the cracks.
      </h2>

      <p className="text-body text-center mb-8 max-w-lg mx-auto text-lg">
        Get organised. Protect your renewals. Get paid faster.
      </p>

      <div className="max-w-md mx-auto">
        <Button size="lg" className="w-full text-base font-semibold py-6 mb-3" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Start 30-Day Trial →
          </a>
        </Button>
        <p className="text-center text-sm text-subtle">
          One extra boiler service per month pays for the system.
        </p>
      </div>
    </section>
  );
};
