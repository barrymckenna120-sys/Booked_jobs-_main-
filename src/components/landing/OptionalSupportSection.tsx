import { Headphones, RefreshCw, TrendingUp } from "lucide-react";

export const OptionalSupportSection = () => {
  const features = [
    { icon: RefreshCw, text: "Ongoing updates" },
    { icon: TrendingUp, text: "Visibility improvements" },
    { icon: Headphones, text: "Priority support" },
  ];

  return (
    <section className="section-container bg-secondary">
      <h3 className="text-xl font-bold text-heading mb-2">Optional Managed Google Support</h3>
      <div className="mb-4">
        <span className="text-2xl font-bold text-heading">€100</span>
        <span className="text-body"> / month + VAT</span>
      </div>
      
      <ul className="space-y-2 mb-4">
        {features.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-body text-sm">
            <item.icon className="w-4 h-4 text-primary flex-shrink-0" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      
      <p className="text-sm text-subtle italic">
        Optional. Cancel anytime.
      </p>
    </section>
  );
};
