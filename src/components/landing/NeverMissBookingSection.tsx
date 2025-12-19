import { Clock, CreditCard, Bell, Moon, Check } from "lucide-react";

export const NeverMissBookingSection = () => {
  const features = [
    {
      icon: CreditCard,
      text: "Customers can pay a call-out fee upfront",
    },
    {
      icon: Bell,
      text: "You get alerted by email and WhatsApp",
    },
    {
      icon: Moon,
      text: "Lead capture works even after hours",
    },
  ];

  return (
    <section className="section-container">
      <h2 className="section-heading text-center flex items-center justify-center gap-2">
        <Clock className="w-7 h-7 text-cta" />
        Never Miss a Booking Again
      </h2>
      
      <p className="text-body text-center mb-6">
        Your 24/7 booking system captures serious jobs while you're on-site.
      </p>
      
      <div className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <div 
            key={index} 
            className="flex items-center gap-3 bg-secondary/50 rounded-lg p-4"
          >
            <div className="w-10 h-10 rounded-full bg-cta/10 flex items-center justify-center flex-shrink-0">
              <feature.icon className="w-5 h-5 text-cta" />
            </div>
            <p className="text-body">{feature.text}</p>
          </div>
        ))}
      </div>
      
      <div className="bg-cta/10 rounded-lg p-4 text-center">
        <p className="font-semibold text-heading flex items-center justify-center gap-2">
          <Check className="w-5 h-5 text-cta" />
          No more back-and-forth. No more missed calls.
        </p>
      </div>
    </section>
  );
};
