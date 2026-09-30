import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { findGuide, findStep } from "@/help/registry";
import { HelpScreenshotView } from "@/components/help/HelpScreenshotView";
import { HelpNotFound } from "./HelpGuide";
import { cn } from "@/lib/utils";

const HelpStep = () => {
  const { guideSlug, stepSlug } = useParams();
  const guide = findGuide(guideSlug);
  const found = findStep(guide, stepSlug);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [stepSlug]);

  if (!guide || !found) return <HelpNotFound />;
  const { step, index } = found;
  const total = guide.steps.length;
  const prev = guide.steps[index - 1];
  const next = guide.steps[index + 1];

  return (
    <div className="md:grid md:grid-cols-[240px_1fr] md:gap-8">
      <nav className="hidden md:block" aria-label={`${guide.title} steps`}>
        <Link to={`/help/${guide.slug}`} className="font-semibold text-primary">{guide.title}</Link>
        <ol className="mt-3 space-y-1 text-[15px]">
          {guide.steps.map((s, i) => (
            <li key={s.slug}>
              <Link
                to={`/help/${guide.slug}/${s.slug}`}
                aria-current={i === index ? "step" : undefined}
                className={cn("block rounded-lg px-3 py-2", i === index ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted")}
              >
                {i + 1}. {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <article className="mx-auto w-full max-w-2xl">
        <Link to={`/help/${guide.slug}`} className="text-sm font-medium text-primary md:hidden">{guide.title}</Link>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">Step {index + 1} of {total}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={total}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight">{step.title}</h1>
        <div className="mt-3 space-y-3">
          {step.body.map((p) => <p key={p}>{p}</p>)}
        </div>

        {step.instructions?.length ? (
          <ol className="mt-4 space-y-2">
            {step.instructions.map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {step.callouts?.length ? (
          <dl className="mt-4 space-y-3">
            {step.callouts.map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-card p-3">
                <dt className="text-sm font-bold uppercase tracking-wide text-primary">{c.label}</dt>
                <dd className="mt-0.5">{c.text}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {step.note ? (
          <div className={cn("mt-4 flex gap-3 rounded-xl border p-3",
            step.note.tone === "warning" ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5")}>
            {step.note.tone === "warning" ? <TriangleAlert className="mt-1 h-5 w-5 shrink-0 text-destructive" /> : <Info className="mt-1 h-5 w-5 shrink-0 text-primary" />}
            <p>{step.note.text}</p>
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          {step.screenshots.map((s) => <HelpScreenshotView key={s.src} shot={s} />)}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {prev ? (
            <Link to={`/help/${guide.slug}/${prev.slug}`} className="flex h-14 items-center gap-1 rounded-2xl border border-border bg-card px-3 font-semibold">
              <ChevronLeft className="h-5 w-5 shrink-0" /> <span className="truncate">Previous</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={`/help/${guide.slug}/${next.slug}`} className="flex h-14 items-center justify-end gap-1 rounded-2xl bg-primary px-3 font-semibold text-primary-foreground">
              <span className="truncate">Next</span> <ChevronRight className="h-5 w-5 shrink-0" />
            </Link>
          ) : (
            <Link to={`/help/${guide.slug}`} className="flex h-14 items-center justify-center rounded-2xl bg-primary px-3 font-semibold text-primary-foreground">
              Finish
            </Link>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">Last updated: {guide.lastUpdated}</p>
      </article>
    </div>
  );
};

export default HelpStep;
