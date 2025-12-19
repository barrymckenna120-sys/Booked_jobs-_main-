import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const PricingSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading text-center">💰 Pricing That Makes Sense</h2>
      
      <div className="relative mb-6">
        <Badge className="bg-warning text-warning-foreground mb-4">
          ⚡ Introductory Offer – Only 4 Spots Left
        </Badge>
      </div>
      
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-secondary">
              <th className="text-left py-3 px-4 font-semibold text-heading">Package</th>
              <th className="text-left py-3 px-4 font-semibold text-heading">What's Included</th>
              <th className="text-right py-3 px-4 font-semibold text-heading">Price</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-3 px-4 font-medium text-heading">One-Time Setup</td>
              <td className="py-3 px-4 text-body">Google Profile + Booking Form</td>
              <td className="py-3 px-4 text-right font-semibold text-heading">€250 + VAT</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-3 px-4 font-medium text-heading">Monthly (First 3 Months)</td>
              <td className="py-3 px-4 text-body">Full management & updates</td>
              <td className="py-3 px-4 text-right font-semibold text-heading">€200/month + VAT</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-3 px-4 font-medium text-heading">Ongoing (After Month 3)</td>
              <td className="py-3 px-4 text-body">Stay or cancel anytime</td>
              <td className="py-3 px-4 text-right font-semibold text-heading">€250/month + VAT</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div className="bg-primary/10 rounded-lg p-4 mb-6">
        <p className="text-center">
          <span className="text-body">💡 Total First 3 Months:</span>
          <br />
          <span className="text-2xl font-bold text-primary">€1,046 incl. VAT</span>
        </p>
      </div>
      
      <ul className="space-y-2 mb-6 text-sm text-body">
        <li className="flex items-center gap-2">
          <span>•</span>
          No payment required until we confirm your area
        </li>
        <li className="flex items-center gap-2">
          <span>•</span>
          Cancel anytime after 3 months
        </li>
      </ul>
      
      <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
        <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
          Claim Offer – No Payment Needed →
        </a>
      </Button>
    </section>
  );
};
