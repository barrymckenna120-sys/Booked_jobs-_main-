import { Clock, CreditCard, Bell, Moon, Check, MessageCircle } from "lucide-react";
import missedCallImg from "@/assets/missed-call-cost.png";
import whatsappMockupImg from "@/assets/whatsapp-quote-mockup.png";

export const NeverMissBookingSection = () => {
  const features = [
    {
      icon: CreditCard,
      text: "Customers pay a call-out fee upfront — no time-wasters",
    },
    {
      icon: Bell,
      text: "You get alerted instantly by email and WhatsApp",
    },
    {
      icon: Moon,
      text: "Lead capture works 24/7 — even after hours",
    },
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

      <div className="section-container relative z-10 py-16 space-y-14">
        {/* ── Missed Call Cost Block ── */}
        <div className="space-y-6">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-2 bg-destructive/10 text-destructive text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              The Real Cost of Missed Calls
            </span>
            <h2 className="section-heading">
              Every Missed Call Costs You Money
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              One missed call a day doesn't seem like much — until you add it up.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden border-2 border-destructive/20 shadow-lg bg-background">
            <img
              src={missedCallImg}
              alt="What 1 missed call per day really costs — €2,400 per month in lost boiler service revenue"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>

          <p className="text-center text-sm text-muted-foreground font-medium">
            Just one missed call per day can cost <span className="text-destructive font-bold">€2,400+ per month</span>.
          </p>
        </div>

        {/* ── Never Miss a Booking Block ── */}
        <div className="space-y-6">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-2 bg-[#25D366]/10 text-[#25D366] text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              <MessageCircle className="w-3.5 h-3.5" />
              Automatic WhatsApp Reminders
            </span>
            <h2 className="section-heading">
              Never Miss a Booking Again
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Send quotes, reminders, and booking confirmations straight to your customer's WhatsApp — automatically.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* WhatsApp mockup */}
            <div className="flex justify-center">
              <div className="relative max-w-[280px] md:max-w-[320px]">
                <div className="absolute -inset-4 bg-[#25D366]/10 rounded-[2rem] blur-xl" />
                <img
                  src={whatsappMockupImg}
                  alt="WhatsApp quote message showing automated quote delivery to a customer"
                  className="relative w-full h-auto drop-shadow-2xl"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Features list */}
            <div className="space-y-4">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 bg-card/80 backdrop-blur-sm rounded-xl p-4 border border-border hover:border-[#25D366]/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <p className="text-foreground font-medium pt-2">{feature.text}</p>
                </div>
              ))}

              <div className="bg-[#25D366]/10 rounded-xl p-5 text-center border border-[#25D366]/20 mt-6">
                <p className="font-bold text-foreground flex items-center justify-center gap-2">
                  <Check className="w-5 h-5 text-[#25D366]" />
                  No more back-and-forth. No more missed calls.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
