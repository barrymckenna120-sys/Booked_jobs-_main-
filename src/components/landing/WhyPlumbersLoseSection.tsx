import { AlertTriangle, Search, PhoneOff, TrendingDown } from "lucide-react";

export const WhyPlumbersLoseSection = () => {
  const stats = [
    {
      icon: Search,
      stat: "77%",
      text: "of homeowners use Google to find a plumber",
    },
    {
      icon: TrendingDown,
      stat: "30–50%",
      text: "choose from the top 3 results",
    },
    {
      icon: PhoneOff,
      stat: "Missed calls",
      text: "= lost bookings, lost revenue",
    },
  ];

  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center flex items-center justify-center gap-2">
        <AlertTriangle className="w-7 h-7 text-cta" />
        Why Plumbers Are Losing Customers
      </h2>
      
      <div className="space-y-4 mb-8">
        {stats.map((item, index) => (
          <div 
            key={index} 
            className="flex items-center gap-4 bg-background rounded-lg p-4 border border-border"
          >
            <div className="w-12 h-12 rounded-full bg-cta/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-6 h-6 text-cta" />
            </div>
            <div>
              <p className="text-xl font-bold text-cta">{item.stat}</p>
              <p className="text-body text-sm">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-cta/10 rounded-lg p-6 text-center">
        <p className="font-semibold text-heading mb-2">
          Stop losing the customers you already have.
        </p>
        <p className="text-body text-sm">
          With our booking system and profile setup, your phone doesn't have to ring for the job to be won.
        </p>
      </div>
    </section>
  );
};
