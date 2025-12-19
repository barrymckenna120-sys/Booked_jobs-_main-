import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import plumberHero from "@/assets/plumber-hero.png";

export const HeroSection = () => {
  return (
    <section className="section-container pt-12">
      <h1 className="text-3xl font-bold text-heading leading-tight mb-4">
        Digital Marketing for Plumbers | Get More Local Jobs
      </h1>
      
      <h2 className="text-xl font-semibold text-heading mb-4">
        Customers Book You While You're Working
      </h2>
      
      <div className="space-y-2 mb-6">
        <p className="flex items-center gap-2 text-body">
          <Check className="w-5 h-5 text-cta flex-shrink-0" />
          Show up in local Google searches
        </p>
        <p className="flex items-center gap-2 text-body">
          <Check className="w-5 h-5 text-cta flex-shrink-0" />
          Customers book via WhatsApp, Facebook & Google — even after hours
        </p>
      </div>
      
      <p className="text-body mb-6">
        We set up your Google profile, install a 24/7 booking form, and connect it to your socials — so jobs come in while you're on the tools.
      </p>
      
      <img 
        src={plumberHero} 
        alt="Professional plumber servicing a boiler in a kitchen" 
        className="w-full rounded-lg mb-8"
      />
      
      <div className="flex flex-col gap-3 mb-6">
        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Claim My €250 Setup Offer →
          </a>
        </Button>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-sm text-subtle">
          No payment needed • Offer ends 31 Jan • Only 4 slots left
        </p>
      </div>
    </section>
  );
};
