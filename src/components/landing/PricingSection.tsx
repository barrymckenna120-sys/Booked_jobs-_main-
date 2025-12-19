import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Calendar, Check, Zap } from "lucide-react";

export const PricingSection = () => {
  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center">Pricing That Makes Sense</h2>
      
      <div className="flex justify-center mb-8">
        <Badge className="bg-cta text-cta-foreground px-4 py-2 text-sm font-medium">
          <Zap className="w-4 h-4 mr-2" />
          Introductory Offer – Only 4 Spots Left
        </Badge>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* One-Time Setup Card */}
        <div className="bg-background rounded-xl p-6 shadow-sm border border-border transition-all duration-300 hover:shadow-lg hover:border-cta/30 hover:-translate-y-1 group">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
              <Wrench className="w-6 h-6 text-cta transition-transform duration-300 group-hover:rotate-12" />
            </div>
            <h3 className="text-lg font-semibold text-heading">One-Time Setup</h3>
          </div>
          
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">What's Included</p>
            <ul className="space-y-2 text-sm text-body">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Google Business Profile setup
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Booking form on Google, WhatsApp & Facebook
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Mobile-ready & branded for your business
              </li>
            </ul>
          </div>
          
          <div className="text-center pt-4 border-t border-border">
            <p className="text-3xl font-bold text-heading transition-colors duration-300 group-hover:text-cta">€250</p>
            <p className="text-sm text-muted-foreground">+ VAT</p>
          </div>
        </div>
        
        {/* Monthly Management Card */}
        <div className="bg-background rounded-xl p-6 shadow-sm border border-border transition-all duration-300 hover:shadow-lg hover:border-cta/30 hover:-translate-y-1 group">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
              <Calendar className="w-6 h-6 text-cta transition-transform duration-300 group-hover:rotate-6" />
            </div>
            <h3 className="text-lg font-semibold text-heading">Monthly Management</h3>
          </div>
          
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">What's Included</p>
            <ul className="space-y-2 text-sm text-body">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Weekly Google posts & profile updates
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Booking form alerts by email & WhatsApp
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cta mt-0.5 flex-shrink-0" />
                Customer support and content uploads
              </li>
            </ul>
          </div>
          
          <div className="text-center pt-4 border-t border-border">
            <p className="text-3xl font-bold text-heading transition-colors duration-300 group-hover:text-cta">€200<span className="text-lg font-normal">/month</span></p>
            <p className="text-sm text-muted-foreground">+ VAT • Then €250/month after month 3</p>
          </div>
        </div>
      </div>
      
      {/* Total Summary */}
      <div className="bg-cta/10 rounded-xl p-6 mb-6">
        <p className="text-center text-sm text-muted-foreground mb-2">First 3 Months Total</p>
        <p className="text-center text-3xl font-bold text-cta mb-4">€1,046 incl. VAT</p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-4 text-sm text-body">
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-cta" />
            No payment required to get started
          </span>
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-cta" />
            Cancel anytime after 3 months
          </span>
        </div>
      </div>
      
      <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
        <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
          Set Up My Booking System →
        </a>
      </Button>
    </section>
  );
};
