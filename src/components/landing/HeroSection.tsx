import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import plumberHero from "@/assets/plumber-hero.png";

export const HeroSection = () => {
  return (
    <section className="section-container pt-12">
      <h1 className="text-3xl font-bold text-heading leading-tight mb-4">
        Booking System for Plumbers | Stop Losing the Customers You Already Have
      </h1>
      
      <h2 className="text-xl font-semibold text-heading mb-4">
        Customers Book You While You're Working
      </h2>
      
      <div className="space-y-2 mb-6">
        <p className="flex items-center gap-2 text-body">
          <Check className="w-5 h-5 text-cta flex-shrink-0" />
          Never miss a booking again
        </p>
        <p className="flex items-center gap-2 text-body">
          <Check className="w-5 h-5 text-cta flex-shrink-0" />
          Show up when locals search for a plumber
        </p>
      </div>
      
      <p className="text-body mb-6">
        We set up your Google Business Profile and install a 24/7 booking system — so your leads are captured automatically while you're on the job.
      </p>
      
      <img 
        src={plumberHero} 
        alt="Professional plumber servicing a boiler in a kitchen" 
        className="w-full rounded-lg mb-8"
      />
      
      <div className="flex flex-col gap-3 mb-6">
        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Set Up My Booking System →
          </a>
        </Button>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-sm text-subtle">
          No payment required • Only 4 plumber slots left
        </p>
      </div>
    </section>
  );
};
