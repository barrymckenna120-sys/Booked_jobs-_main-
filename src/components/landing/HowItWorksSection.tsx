import { MessageSquare, Settings, TrendingUp } from "lucide-react";

export const HowItWorksSection = () => {
  const steps = [
    {
      number: "01",
      icon: MessageSquare,
      title: "Book a Quick Call",
      description: "15-minute chat to understand your business and goals.",
    },
    {
      number: "02",
      icon: Settings,
      title: "We Set Everything Up",
      description: "Google profile optimised + booking system installed within 48 hours.",
    },
    {
      number: "03",
      icon: TrendingUp,
      title: "Start Capturing Leads",
      description: "Customers book you 24/7 while you focus on the job.",
    },
  ];

  return (
    <section className="section-container bg-muted/30">
      <h2 className="section-heading text-center">How It Works</h2>
      <p className="text-body text-center mb-10 max-w-xl mx-auto">
        Simple setup. No tech skills needed. We handle everything.
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((step, index) => (
          <div
            key={index}
            className="relative bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="absolute top-2 right-4 text-5xl font-bold text-primary/10">
              {step.number}
            </span>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
            </div>
            <p className="text-body">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
