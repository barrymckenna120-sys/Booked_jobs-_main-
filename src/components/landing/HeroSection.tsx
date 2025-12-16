import { Button } from "@/components/ui/button";
import plumberHero from "@/assets/plumber-hero.png";

export const HeroSection = () => {
  return (
    <section className="section-container pt-12">
      <h1 className="text-3xl font-bold text-heading leading-tight mb-4">
        Get More Plumbing Jobs from Google — Without Missing Calls
      </h1>
      
      <p className="text-lg text-body mb-6">
        Google setup + 24/7 booking for local plumbers.
      </p>
      
      <img 
        src={plumberHero} 
        alt="Professional plumber servicing a boiler in a kitchen" 
        className="w-full rounded-lg mb-8"
      />
      
      <div className="flex flex-col gap-3 mb-8">
        <Button size="lg" className="w-full text-base font-semibold py-6">
          Get More Plumbing Jobs
        </Button>
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
          Add 24/7 Plumbing Booking
        </Button>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-sm text-subtle">
          Built for Irish plumbers doing call-outs and boiler work.
        </p>
        <p className="text-sm text-subtle">
          No payment required to get started • Offer ends 31 January
        </p>
      </div>
    </section>
  );
};
