import { CheckCircle2 } from "lucide-react";

export const HeaderSection = () => {
  return (
    <header className="section-container pt-4 pb-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-8 h-8 text-cta" />
        <span className="text-2xl font-bold text-heading">BookedJobs</span>
      </div>
    </header>
  );
};
