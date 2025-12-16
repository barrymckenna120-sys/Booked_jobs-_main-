import { CreditCard, UserX, Shield } from "lucide-react";

export const OptionalPaymentsSection = () => {
  const bullets = [
    { icon: CreditCard, text: "Take payment at booking" },
    { icon: UserX, text: "Reduce no-shows" },
    { icon: Shield, text: "Filter out time wasters" },
  ];

  return (
    <section className="section-container">
      <h2 className="section-heading">Optional Call-Out Fees Upfront</h2>
      
      <ul className="bullet-list mb-6">
        {bullets.map((item, index) => (
          <li key={index} className="bullet-item">
            <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      
      <p className="text-heading font-semibold">
        You stay in control.
      </p>
    </section>
  );
};
