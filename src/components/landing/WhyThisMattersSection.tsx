import { Search, Trophy, PhoneMissed } from "lucide-react";

export const WhyThisMattersSection = () => {
  const bullets = [
    { icon: Search, text: "77% of homeowners use Google to find plumbers" },
    { icon: Trophy, text: "30–50% choose from the top 3 results" },
    { icon: PhoneMissed, text: "Plumbers miss up to 20% of calls daily" },
  ];

  return (
    <section className="section-container bg-secondary">
      <h2 className="section-heading">Why This Matters</h2>
      
      <ul className="bullet-list mb-6">
        {bullets.map((item, index) => (
          <li key={index} className="bullet-item">
            <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      
      <p className="text-body font-medium">
        If you're not visible — or not available — the job goes elsewhere.
      </p>
    </section>
  );
};
