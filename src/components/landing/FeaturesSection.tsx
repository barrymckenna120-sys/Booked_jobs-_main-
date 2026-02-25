import { CheckCircle2, Clock, CalendarCheck, MessageCircle, Star, CreditCard, Users, ClipboardList } from "lucide-react";

const features = [
  { icon: Clock, title: "24/7 Online Booking" },
  { icon: CalendarCheck, title: "Automatic Annual Service Tracking" },
  { icon: MessageCircle, title: "WhatsApp Repair Quotes" },
  { icon: Star, title: "Google Review Requests After Every Job" },
  { icon: CreditCard, title: "Deposit & Call-Out Payments" },
  { icon: Users, title: "Full Customer History" },
  { icon: ClipboardList, title: "Manual Job Entry & Payment Control" },
];

export const FeaturesSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading text-center">
        Everything you need to run a serious boiler service business.
      </h2>
      <p className="text-body text-center mb-10 max-w-xl mx-auto">
        Save hours every week on routine admin — without losing control.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-4 bg-card rounded-xl p-5 border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-cta/10 flex items-center justify-center flex-shrink-0">
              <f.icon className="w-5 h-5 text-cta" />
            </div>
            <p className="font-semibold text-heading text-sm">{f.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
