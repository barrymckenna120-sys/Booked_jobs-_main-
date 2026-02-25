import { Calendar, LayoutDashboard, ShieldCheck } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Calendar,
    title: "Customers book anytime.",
    description: "24/7 online booking form — customers request services even when you're on the tools.",
  },
  {
    number: "02",
    icon: LayoutDashboard,
    title: "You manage everything in one dashboard.",
    description: "Jobs, quotes, payments, renewals and customer history — all in one place.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "The system protects your recurring income.",
    description: "Automatic service tracking ensures no renewal is forgotten. Ever.",
  },
];

export const HowItWorksSection = () => {
  return (
    <section className="section-container bg-muted/30">
      <h2 className="section-heading text-center">How BookedJobs works.</h2>
      <p className="text-body text-center mb-10 max-w-xl mx-auto">
        Three simple steps to take control of your boiler service business.
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
