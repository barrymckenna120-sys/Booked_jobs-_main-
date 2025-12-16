import { Clock, CheckCircle2 } from "lucide-react";
import googleLogo from "@/assets/google-logo.png";

export const WhatWeSetUpSection = () => {
  const googleFeatures = [
    "Correct plumbing categories",
    "Service areas added",
    "Professional appearance",
    "Call, WhatsApp & booking buttons",
  ];

  const bookingFeatures = [
    "Customers book anytime",
    "From Google, WhatsApp or website",
    "Jobs captured while you're working",
  ];

  return (
    <section className="section-container">
      <h2 className="section-heading">What We Set Up</h2>
      <p className="section-subheading">
        Everything needed to get found, trusted, and booked.
      </p>
      
      <div className="space-y-4">
        <div className="pricing-card">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mx-auto mb-4 shadow-sm">
            <img src={googleLogo} alt="Google" className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-heading mb-4">Google Business Profile</h3>
          <ul className="space-y-2 text-left">
            {googleFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-body text-sm">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="pricing-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-bold text-lg text-heading mb-4">24/7 Plumbing Booking Form</h3>
          <ul className="space-y-2 text-left">
            {bookingFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-body text-sm">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
