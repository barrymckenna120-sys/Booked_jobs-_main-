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
    <section className="section-container py-16">
      <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-accent/20 rounded-3xl p-8 lg:p-12 border border-primary/10">
        <h2 className="section-heading text-center mb-2">Sound familiar?</h2>
        <p className="text-muted-foreground text-center mb-8 max-w-lg mx-auto text-sm">
          These problems grow with every customer you add.
        </p>

        <div className="space-y-3 max-w-2xl mx-auto">
          {problems.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-4 bg-background/80 backdrop-blur-sm rounded-xl p-4 border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-foreground font-medium">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
