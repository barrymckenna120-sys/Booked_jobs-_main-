import { Button } from "@/components/ui/button";

export const FinalCTASection = () => {
  return (
    <section className="section-container bg-primary/5">
      <h2 className="section-heading text-center">
        Ready to Stop Losing Plumbing Jobs?
      </h2>
      
      <div className="flex flex-col gap-3 mb-6">
        <Button size="lg" className="w-full text-base font-semibold py-6">
          Get More Plumbing Jobs
        </Button>
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
          Add 24/7 Plumbing Booking
        </Button>
      </div>
      
      <p className="text-sm text-subtle text-center">
        No payment required • Offer ends 31 January
      </p>
    </section>
  );
};
