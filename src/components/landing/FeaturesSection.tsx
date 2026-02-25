import { Clock, CalendarCheck, MessageCircle, Star, CreditCard, Users, ClipboardList } from "lucide-react";

const features = [
  { icon: Clock, title: "24/7 Online Booking", color: "text-primary", bg: "bg-primary/10" },
  { icon: CalendarCheck, title: "Automatic Annual Service Tracking", color: "text-success", bg: "bg-success/10" },
  { icon: MessageCircle, title: "WhatsApp Repair Quotes", color: "text-primary", bg: "bg-primary/10" },
  { icon: Star, title: "Google Review Requests After Every Job", color: "text-warning", bg: "bg-warning/10" },
  { icon: CreditCard, title: "Deposit & Call-Out Payments", color: "text-success", bg: "bg-success/10" },
  { icon: Users, title: "Full Customer History", color: "text-primary", bg: "bg-primary/10" },
  { icon: ClipboardList, title: "Manual Job Entry & Payment Control", color: "text-warning", bg: "bg-warning/10" },
];

export const FeaturesSection = () => {
  return (
    <section className="section-container py-10">
      <div className="bg-gradient-to-br from-primary/5 via-background to-accent/10 rounded-3xl p-8 lg:p-12 border border-primary/10">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-4">
            Features
          </span>
          <h2 className="section-heading text-center">
            Everything you need to run a serious boiler service business.
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto">
            Save hours every week on routine admin — without losing control.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-4 bg-background/80 backdrop-blur-sm rounded-xl p-5 border border-border/60 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-lg ${f.bg} flex items-center justify-center flex-shrink-0`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <p className="font-semibold text-foreground text-sm">{f.title}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
