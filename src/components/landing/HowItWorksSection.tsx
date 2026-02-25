import { Calendar, LayoutDashboard, ShieldCheck } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Calendar,
    title: "Customers book anytime.",
    description: "24/7 online booking form — customers request services even when you're on the tools.",
    gradient: "from-primary/10 to-primary/5",
  },
  {
    number: "02",
    icon: LayoutDashboard,
    title: "You manage everything in one dashboard.",
    description: "Jobs, quotes, payments, renewals and customer history — all in one place.",
    gradient: "from-accent/30 to-accent/10",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "The system protects your recurring income.",
    description: "Automatic service tracking ensures no renewal is forgotten. Ever.",
    gradient: "from-success-light to-primary/5",
  },
];

export const HowItWorksSection = () => {
  return (
    <section className="bg-gradient-to-b from-background to-muted/40 py-16">
      <div className="section-container">
      <div className="text-center mb-12">
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-4">
          How It Works
        </span>
        <h2 className="section-heading text-center">Three steps. Full control.</h2>
        <p className="text-muted-foreground text-center max-w-xl mx-auto">
          From booking to renewal — everything runs through one system.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`relative bg-gradient-to-br ${step.gradient} rounded-2xl p-6 border border-border/60 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1`}
          >
            <span className="absolute top-3 right-4 text-5xl font-extrabold text-primary/10">
              {step.number}
            </span>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shadow-sm">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
};
