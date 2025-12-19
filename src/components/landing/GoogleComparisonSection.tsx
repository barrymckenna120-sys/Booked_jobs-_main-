import { Button } from "@/components/ui/button";
import { Check, X, Search } from "lucide-react";

export const GoogleComparisonSection = () => {
  return (
    <section className="section-container">
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-6 h-6 text-primary" />
        <h2 className="section-heading mb-0">Google Business Profile vs Google Ads</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-semibold text-heading"></th>
              <th className="text-center py-3 px-2 font-semibold text-heading">💸 Cost</th>
              <th className="text-center py-3 px-2 font-semibold text-heading">⏰ Always On</th>
              <th className="text-center py-3 px-2 font-semibold text-heading">🎯 Targeting</th>
              <th className="text-center py-3 px-2 font-semibold text-heading">🤝 Trust</th>
              <th className="text-center py-3 px-2 font-semibold text-heading">📈 ROI</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-3 px-2 font-semibold text-heading">Google Ads</td>
              <td className="py-3 px-2 text-center text-body">€800–€2,000/month</td>
              <td className="py-3 px-2 text-center">
                <X className="w-5 h-5 text-destructive mx-auto" />
                <span className="text-xs text-subtle block">Stops when budget runs out</span>
              </td>
              <td className="py-3 px-2 text-center text-body">Random clickers</td>
              <td className="py-3 px-2 text-center text-body">Low trust</td>
              <td className="py-3 px-2 text-center text-body">Drops off fast</td>
            </tr>
            <tr className="bg-success/5">
              <td className="py-3 px-2 font-semibold text-heading">Google Business Profile</td>
              <td className="py-3 px-2 text-center text-success font-medium">€200–€250/month</td>
              <td className="py-3 px-2 text-center">
                <Check className="w-5 h-5 text-success mx-auto" />
                <span className="text-xs text-subtle block">Works 24/7</span>
              </td>
              <td className="py-3 px-2 text-center text-body">Local customers ready to book</td>
              <td className="py-3 px-2 text-center text-body">High — reviews & photos</td>
              <td className="py-3 px-2 text-center text-body">Builds over time</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div className="bg-secondary rounded-lg p-4 mt-6">
        <p className="text-body text-center">
          🧠 <strong>Google Business is where your next customer chooses you — not just clicks an ad.</strong>
        </p>
      </div>
      
      <div className="mt-6">
        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            📍 Set Up My Profile →
          </a>
        </Button>
      </div>
    </section>
  );
};
