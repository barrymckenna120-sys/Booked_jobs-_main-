import { RefreshCw, AlertTriangle, PhoneOff, MessageCircle } from "lucide-react";

type Props = {
  renewalsDue: number;
  valueAtRisk: number;
  notContacted: number;
  reminded: number;
};

const RenewalsHeroStats = ({ renewalsDue, valueAtRisk, notContacted, reminded }: Props) => {
  const cards = [
    {
      label: "Renewals Due",
      value: String(renewalsDue),
      sub: "next 30 days",
      Icon: RefreshCw,
      gradient: "linear-gradient(135deg, hsl(217 70% 60%), hsl(224 72% 50%))",
      shadow: "0 4px 16px hsla(217,70%,60%,.3)",
    },
    {
      label: "Value at Risk",
      value: `€${valueAtRisk.toLocaleString()}`,
      sub: "if none book",
      Icon: AlertTriangle,
      gradient: "linear-gradient(135deg, hsl(21 90% 48%), hsl(16 84% 40%))",
      shadow: "0 4px 16px hsla(21,90%,48%,.3)",
    },
    {
      label: "Not Contacted",
      value: String(notContacted),
      sub: "not yet reminded",
      Icon: PhoneOff,
      gradient: "linear-gradient(135deg, hsl(330 80% 55%), hsl(340 76% 45%))",
      shadow: "0 4px 16px hsla(330,80%,55%,.3)",
    },
    {
      label: "Reminded",
      value: String(reminded),
      sub: "already sent",
      Icon: MessageCircle,
      gradient: "linear-gradient(135deg, hsl(142 72% 40%), hsl(142 72% 29%))",
      shadow: "0 4px 16px hsla(142,72%,40%,.3)",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl p-4 text-white"
          style={{ background: c.gradient, boxShadow: c.shadow }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <c.Icon className="w-3.5 h-3.5 opacity-70" />
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{c.label}</span>
          </div>
          <div className="text-[32px] font-black leading-none tracking-tight">{c.value}</div>
          <div className="text-[11px] opacity-65 mt-1 font-semibold">{c.sub}</div>
        </div>
      ))}
    </div>
  );
};

export default RenewalsHeroStats;
