import { Euro, TrendingUp, Calculator, Check } from "lucide-react";

export const ROISection = () => {
  return (
    <section className="section-container bg-cta/5 rounded-2xl py-12">
      <h2 className="section-heading text-center flex items-center justify-center gap-2">
        <Euro className="w-7 h-7 text-cta" />
        Protect Your Revenue
      </h2>
      
      <div className="space-y-4 mb-6">
        <div className="bg-background rounded-lg p-5 border border-border text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calculator className="w-5 h-5 text-cta" />
            <p className="text-body">Every missed call =</p>
          </div>
          <p className="text-2xl font-bold text-cta">€180–€400 lost</p>
        </div>
        
        <div className="bg-background rounded-lg p-5 border border-border text-center">
          <p className="text-body mb-2">Just 3–5 missed calls a week?</p>
          <p className="text-2xl font-bold text-cta">€2,000–€8,000/month</p>
          <p className="text-sm text-muted-foreground mt-1">gone.</p>
        </div>
      </div>
      
      <div className="bg-cta/10 rounded-lg p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-cta" />
          <p className="font-semibold text-heading">Pays for itself</p>
        </div>
        <p className="text-body text-sm">
          Our booking system pays for itself with one job a month — and captures leads while you're busy working.
        </p>
      </div>
    </section>
  );
};
