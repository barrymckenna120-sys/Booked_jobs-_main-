import { Button } from "@/components/ui/button";
import plumberHero from "@/assets/plumber-hero.png";

export const HeroSection = () => {
  return (
    <section className="section-container pt-12">
      <h1 className="text-3xl font-bold text-heading leading-tight mb-4">
        Google Business & Social Booking Setup
      </h1>
      
      <div className="text-lg text-body mb-6 space-y-3">
        <p className="font-semibold">Get Found on Google. Book Jobs From Social.</p>
        <p>We set up and optimize your Google Business Profile so you rank in local searches and maps.</p>
        <p>Plus, we add booking links to your Facebook, Instagram, and WhatsApp — turning clicks into confirmed plumbing jobs.</p>
      </div>
      
      <img 
        src={plumberHero} 
        alt="Professional plumber servicing a boiler in a kitchen" 
        className="w-full rounded-lg mb-8"
      />
      
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
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
