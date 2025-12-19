import { CheckCircle2, Headphones, Calendar } from "lucide-react";
import googleLogo from "@/assets/google-logo.png";
import { Button } from "@/components/ui/button";

export const WhatWeSetUpSection = () => {
  const googleFeatures = [
    "Proper plumbing categories",
    "Booking/call/WhatsApp buttons",
    "Weekly Google posts",
    "Reviews & photo optimisation",
  ];

  const bookingFeatures = [
    "Works on your website, Facebook, WhatsApp",
    "Optional call-out fee to filter time-wasters",
    "Instant alerts to your email and WhatsApp",
    "Collects job type, urgency, address, photos",
  ];

  const supportFeatures = [
    "We handle everything",
    "You stay focused on plumbing",
  ];

  return (
    <section className="section-container">
      <h2 className="section-heading">What You Get</h2>
      
      <div className="space-y-4">
        <div className="pricing-card">
          <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <img src={googleLogo} alt="Google" className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-heading mb-4 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-cta" />
            Google Business Profile Setup
          </h3>
          <ul className="space-y-2 text-left">
            {googleFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-body text-sm">
                <CheckCircle2 className="w-4 h-4 text-cta flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="pricing-card">
          <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-6 h-6 text-cta" />
          </div>
          <h3 className="font-bold text-lg text-heading mb-4 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-cta" />
            24/7 Booking Form
          </h3>
          <ul className="space-y-2 text-left">
            {bookingFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-body text-sm">
                <CheckCircle2 className="w-4 h-4 text-cta flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="pricing-card">
          <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center mx-auto mb-4">
            <Headphones className="w-6 h-6 text-cta" />
          </div>
          <h3 className="font-bold text-lg text-heading mb-4 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-cta" />
            Fully Managed Support
          </h3>
          <ul className="space-y-2 text-left">
            {supportFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-body text-sm">
                <CheckCircle2 className="w-4 h-4 text-cta flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="mt-6">
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-cta text-cta hover:bg-cta hover:text-cta-foreground" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Preview the Booking Form →
          </a>
        </Button>
      </div>
    </section>
  );
};
