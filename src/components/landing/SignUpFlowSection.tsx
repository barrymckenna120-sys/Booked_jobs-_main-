import { Button } from "@/components/ui/button";
import { Timer, ClipboardList, Settings, CreditCard } from "lucide-react";

export const SignUpFlowSection = () => {
  const steps = [
    { icon: Timer, text: "Takes under 60 seconds" },
    { icon: ClipboardList, text: "Simple sign-up form" },
    { icon: Settings, text: "Choose your service" },
    { icon: CreditCard, text: "No payment required" },
  ];

  return (
    <section className="section-container bg-secondary">
      <h2 className="section-heading">What the Sign-Up Looks Like</h2>
      
      <ul className="space-y-4 mb-6">
        {steps.map((item, index) => (
          <li key={index} className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
              {index + 1}
            </div>
            <div className="flex items-center gap-2 text-body">
              <item.icon className="w-4 h-4 text-subtle" />
              <span>{item.text}</span>
            </div>
          </li>
        ))}
      </ul>
      
      <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
        View Sign-Up Form
      </Button>
      
      <p className="text-sm text-subtle text-center mt-4">
        We usually review and confirm setup within 24 hours.
      </p>
    </section>
  );
};
