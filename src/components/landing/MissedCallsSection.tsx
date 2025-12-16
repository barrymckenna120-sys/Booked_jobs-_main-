import { AlertCircle } from "lucide-react";

export const MissedCallsSection = () => {
  const losses = [
    { amount: "€1,000", period: "a day" },
    { amount: "€5,000", period: "a week" },
    { amount: "€20,000+", period: "a month" },
  ];

  return (
    <section className="section-container">
      <h2 className="section-heading">Missed Calls = Lost Plumbing Jobs</h2>
      
      <p className="text-body mb-6">
        Miss just 10 calls a day at €100 per job?
      </p>
      
      <div className="bg-highlight rounded-xl p-5 mb-6">
        <ul className="space-y-3">
          {losses.map((item, index) => (
            <li key={index} className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-heading">
                <span className="font-bold text-xl">{item.amount}</span>{" "}
                <span className="text-body">{item.period}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      
      <p className="text-body font-medium">
        Lost — just because you were busy working.
      </p>
    </section>
  );
};
