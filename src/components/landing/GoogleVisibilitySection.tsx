import { MapPin, Users, ListX } from "lucide-react";

export const GoogleVisibilitySection = () => {
  const bullets = [
    { icon: MapPin, text: "You don't appear on Google Maps" },
    { icon: Users, text: "Local customers can't find you" },
    { icon: ListX, text: "You don't get shortlisted" },
  ];

  return (
    <section className="section-container bg-secondary">
      <h2 className="section-heading">No Google Profile = Invisible</h2>
      
      <ul className="bullet-list mb-6">
        {bullets.map((item, index) => (
          <li key={index} className="bullet-item">
            <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      
      <p className="text-heading font-bold text-lg">
        No listing = no jobs.
      </p>
    </section>
  );
};
