import { Button } from "@/components/ui/button";

export const HeroSection = () => {
  return (
    <section className="section-container pt-12">
      <h1 className="text-3xl font-bold text-heading leading-tight mb-4">
        As your boiler service customer base grows, so does the admin.
      </h1>

      <p className="text-body mb-4 text-lg leading-relaxed">
        More renewals. More messages. More quotes. More payments to track.
      </p>

      <p className="text-body mb-4 leading-relaxed">
        When you're dealing with hundreds — even thousands — of customers, it's easy for things to slip through the cracks.
      </p>

      <p className="text-body mb-8 leading-relaxed font-medium">
        BookedJobs gives boiler service companies a simple system to stay organised and protect recurring income.
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <Button size="lg" className="w-full text-base font-semibold py-6" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            Start 30-Day Trial →
          </a>
        </Button>
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6" asChild>
          <a href="#demo">
            Watch 2-Min Demo
          </a>
        </Button>
      </div>

      <p className="text-center text-sm text-subtle">
        One extra boiler service per month pays for the system.
      </p>
    </section>
  );
};
