import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { findGuide } from "@/help/registry";

export const HelpNotFound = () => (
  <div className="mx-auto max-w-2xl py-10 text-center">
    <h1 className="text-2xl font-bold">Guide not found</h1>
    <p className="mt-2 text-foreground/80">This help page doesn't exist or has moved.</p>
    <Link to="/help" className="mt-4 inline-block font-semibold text-primary">Back to Help & Training</Link>
  </div>
);

const HelpGuide = () => {
  const { guideSlug } = useParams();
  const guide = findGuide(guideSlug);
  if (!guide) return <HelpNotFound />;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">{guide.title}</h1>
      <p className="mt-2 text-foreground/80">{guide.description}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {guide.steps.length} steps · Last updated: {guide.lastUpdated}
      </p>
      {guide.intro?.map((p) => (
        <p key={p} className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">{p}</p>
      ))}
      {guide.beforeYouStart?.length ? (
        <section className="mt-5">
          <h2 className="text-lg font-bold">Before you start</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.beforeYouStart.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      ) : null}
      <Link
        to={`/help/${guide.slug}/${guide.steps[0].slug}`}
        className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground"
      >
        Start guide
      </Link>
      <ol className="mt-6 space-y-2">
        {guide.steps.map((s, i) => (
          <li key={s.slug}>
            <Link
              to={`/help/${guide.slug}/${s.slug}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-foreground/75">{s.shortDescription}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default HelpGuide;
