import { TrendingDown, TrendingUp } from "lucide-react";

export const GoogleVsAdsSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading">Google vs Ads</h2>
      
      <div className="space-y-4">
        <div className="bg-muted rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <span className="font-semibold text-heading">Ads</span>
          </div>
          <p className="text-body">
            Spend stops → leads stop.
          </p>
        </div>
        
        <div className="bg-highlight rounded-xl p-5 border-2 border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-success" />
            <span className="font-semibold text-heading">Google</span>
          </div>
          <p className="text-body mb-2">
            Works all year, builds trust, delivers jobs every week.
          </p>
          <p className="text-body font-medium">
            This is where homeowners actually choose a plumber.
          </p>
        </div>
      </div>
    </section>
  );
};
