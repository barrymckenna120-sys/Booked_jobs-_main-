import { Button } from "@/components/ui/button";

export const FinalCTASection = () => {
  return (
    <section className="section-container bg-primary/5">
      <h2 className="section-heading text-center">
        Ready to Stop Losing Plumbing Jobs?
      </h2>
      
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Get More Plumbing Jobs
          </a>
        </Button>
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Add 24/7 Plumbing Booking
          </a>
        </Button>
      </div>
      
      <p className="text-sm text-subtle text-center">
        No payment required • Offer ends 31 January
      </p>
    </section>
  );
};
