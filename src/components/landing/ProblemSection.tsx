import { PhoneOff, CalendarX, Clock, FileX, Briefcase } from "lucide-react";

const problems = [
  { icon: PhoneOff, text: "Missed calls turn into lost jobs" },
  { icon: CalendarX, text: "Annual services fall through the cracks" },
  { icon: Clock, text: "Customers aren't contacted on time" },
  { icon: FileX, text: "Repair quotes aren't followed up" },
  { icon: Briefcase, text: "Admin takes over your evenings" },
];

export const ProblemSection = () => {
  return (
    <section className="section-container bg-secondary/30 rounded-2xl py-12">
      <h2 className="section-heading text-center mb-8">Sound familiar?</h2>

      <div className="space-y-3">
        {problems.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-4 bg-background rounded-lg p-4 border border-border"
          >
            <div className="w-10 h-10 rounded-full bg-cta/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-cta" />
            </div>
            <p className="text-body font-medium">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
