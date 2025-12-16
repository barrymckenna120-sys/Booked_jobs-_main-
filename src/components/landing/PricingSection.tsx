import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading text-center">Pricing</h2>
      <p className="text-center text-sm text-subtle mb-6">Introductory Offer</p>
      
      <div className="space-y-4">
        {/* Google Business Profile */}
        <div className="pricing-card">
          <h3 className="font-bold text-lg text-heading mb-2">Google Business Profile Setup</h3>
          <div className="mb-4">
            <span className="text-3xl font-bold text-heading">€450</span>
            <span className="text-body"> + VAT</span>
          </div>
          <p className="text-sm text-subtle line-through mb-4">€600 normal price</p>
          <Button size="lg" className="w-full text-base font-semibold py-5">
            Get More Plumbing Jobs
          </Button>
        </div>
        
        {/* 24/7 Booking */}
        <div className="pricing-card">
          <h3 className="font-bold text-lg text-heading mb-2">24/7 Plumbing Booking Form</h3>
          <div className="mb-4">
            <span className="text-3xl font-bold text-heading">€450</span>
            <span className="text-body"> + VAT</span>
          </div>
          <p className="text-sm text-subtle line-through mb-4">€600 normal price</p>
          <Button size="lg" variant="outline" className="w-full text-base font-semibold py-5 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
            Add 24/7 Plumbing Booking
          </Button>
        </div>
        
        {/* Best Value */}
        <div className="pricing-card border-2 border-primary relative">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
            Best Value
          </Badge>
          <h3 className="font-bold text-lg text-heading mb-2 mt-2">Complete Package</h3>
          <div className="mb-2">
            <span className="text-3xl font-bold text-primary">€800</span>
            <span className="text-body"> + VAT</span>
          </div>
          <p className="text-sm text-subtle line-through mb-2">€1,200 normal price</p>
          <div className="flex items-center justify-center gap-2 mb-4 text-sm text-success font-medium">
            <Check className="w-4 h-4" />
            <span>Save €400</span>
          </div>
          <Button size="lg" className="w-full text-base font-semibold py-5">
            Claim Offer
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-subtle text-center mt-6">
        If it doesn't make sense for your area, we'll tell you before setup.
      </p>
    </section>
  );
};
