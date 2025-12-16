import { FileText, MapPin, AlertTriangle, Clock, Camera } from "lucide-react";

export const NoBackAndForthSection = () => {
  const items = [
    { icon: FileText, text: "Job type" },
    { icon: MapPin, text: "Location" },
    { icon: AlertTriangle, text: "Urgency" },
    { icon: Clock, text: "Preferred time" },
    { icon: Camera, text: "Photos (optional)" },
  ];

  return (
    <section className="section-container bg-secondary">
      <h2 className="section-heading">No Back-and-Forth</h2>
      
      <p className="text-body mb-6">The booking form collects:</p>
      
      <div className="bg-card rounded-xl p-5 mb-6">
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 text-body">
              <item.icon className="w-5 h-5 text-primary flex-shrink-0" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <p className="text-body font-medium">
        Clear job details upfront. Less chasing. Fewer time wasters.
      </p>
    </section>
  );
};
