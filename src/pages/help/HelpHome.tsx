import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LifeBuoy, Search } from "lucide-react";
import { HELP_COMING_SOON, HELP_GUIDES, searchHelp } from "@/help/registry";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ReportIssueDialog from "@/components/support/ReportIssueDialog";

const HelpHome = () => {
  const [query, setQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const { user } = useAuth();
  const results = searchHelp(query);
  const searching = query.trim().length > 1;

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setRole((data?.role as string | null) ?? null));
  }, [user]);

  const isEngineer = role === "engineer";
  const guides = useMemo(() => {
    // Role-aware ordering: engineers see the Engineer App first, office roles see
    // the office/customer guides first. Nothing is hidden — order only.
    const key = isEngineer ? "engineer" : "customer-profile";
    return [...HELP_GUIDES].sort((a, b) => (a.slug === key ? -1 : 0) - (b.slug === key ? -1 : 0));
  }, [isEngineer]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Help & Training</h1>
      <p className="mt-2 text-foreground/80">Find quick step-by-step guides for using BookedJobs.</p>

      <label className="relative mt-5 block">
        <span className="sr-only">Search BookedJobs Help</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search BookedJobs Help..."
          className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-[17px] shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      {searching ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-lg font-semibold">
            {results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "No results"}
          </h2>
          {!results.length && (
            <p className="mt-2 text-foreground/80">Try another word, or open a guide below. More guides are on the way.</p>
          )}
          <ul className="mt-3 space-y-3">
            {results.map(({ guide, step }) => (
              <li key={`${guide.slug}/${step.slug}`}>
                <Link to={`/help/${guide.slug}/${step.slug}`} className="block rounded-2xl border border-border bg-card p-4 hover:border-primary">
                  <p className="text-sm font-medium text-primary">{guide.title}</p>
                  <p className="mt-0.5 text-lg font-semibold">{step.title}</p>
                  <p className="mt-1 text-foreground/80">{step.shortDescription}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 space-y-3">
        {guides.map((g) => (
          <Link key={g.slug} to={`/help/${g.slug}`} className="block rounded-2xl border border-border bg-card p-5 hover:border-primary">
            <p className="text-xl font-bold">{g.title}</p>
            <p className="mt-1 text-foreground/80">{g.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 font-semibold text-primary">
              Open Guide <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
        {HELP_COMING_SOON.map((g) => (
          <div key={g.slug} className="rounded-2xl border border-dashed border-border bg-muted/40 p-5">
            <p className="text-xl font-bold text-foreground/70">{g.title}</p>
            <p className="mt-1 text-foreground/70">{g.description}</p>
            <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-sm font-medium">Coming soon</span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary"
        >
          <LifeBuoy className="h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block text-lg font-bold">Report an issue</span>
            <span className="block text-foreground/80">Tell us about a problem or something that looks wrong.</span>
          </span>
        </button>
      </section>
      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} app={isEngineer ? "engineer" : "office"} />
    </div>
  );
};

export default HelpHome;
