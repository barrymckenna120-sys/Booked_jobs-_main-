import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { HELP_COMING_SOON, HELP_GUIDES, searchHelp } from "@/help/registry";

const HelpHome = () => {
  const [query, setQuery] = useState("");
  const results = searchHelp(query);
  const searching = query.trim().length > 1;

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
        {HELP_GUIDES.map((g) => (
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
      </section>
    </div>
  );
};

export default HelpHome;
