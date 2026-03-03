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

        </ScrollFadeIn>
      </div>
    </section>
  );
};
