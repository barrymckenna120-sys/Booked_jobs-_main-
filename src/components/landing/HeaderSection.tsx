import { Button } from "@/components/ui/button";
import bookedjobsLogo from "@/assets/bookedjobs-logo.jpg";

export const HeaderSection = () => {
  return (
    <header className="section-container pt-6 pb-4 flex items-center justify-between">
      <img src={bookedjobsLogo} alt="BookedJobs" className="h-10 object-contain object-left" />
      <div className="flex items-center gap-3">
        <a href="/auth" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
          Login
        </a>
        <Button size="sm" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Start 30-Day Trial
          </a>
        </Button>
      </div>
    </header>
  );
};
