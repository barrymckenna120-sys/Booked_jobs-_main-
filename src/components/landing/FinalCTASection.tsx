import { Button } from "@/components/ui/button";
import { ScrollFadeIn } from "./ScrollFadeIn";

export const FinalCTASection = () => {
  return (
    <section className="bg-muted py-10">
      <div className="section-container">
        <ScrollFadeIn>
          <h2 className="section-heading text-center">
            Don't miss out on early customer rates.
          </h2>

          <p className="text-body text-center mb-8 max-w-lg mx-auto text-lg">
            Join the waitlist to lock in exclusive rates before we launch.
          </p>

          <div className="max-w-md mx-auto">
            <Button size="lg" className="w-full text-base font-semibold py-6 mb-3" asChild>
              <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                Join the Waitlist →
              </a>
            </Button>
            <p className="text-center text-sm text-subtle">
              Be the first to know when we launch.
            </p>
          </div>
        </ScrollFadeIn>
      </div>
    </section>
  );
};
