import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Wrench, ArrowLeft, Bell, MoreVertical } from "lucide-react";
import type { HelpScreenshot, HelpScreenshotMarker, HelpScreenshotSegment } from "@/help/types";

/** Static copies of the real Engineer App top controls (same icons/styles), non-interactive. */
const ControlPreview = ({ icon }: { icon: NonNullable<HelpScreenshotMarker["icon"]> }) => {
  if (icon === "engineer") return (
    <span aria-hidden="true" className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
      <Wrench className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} />Engineer
    </span>
  );
  if (icon === "office") return (
    <span aria-hidden="true" className="flex min-h-[40px] items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] font-bold text-primary">
      <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />Office
    </span>
  );
  const Icon = icon === "bell" ? Bell : MoreVertical;
  return <Icon aria-hidden="true" className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} />;
};

const ScreenshotMarkers = ({ shot }: { shot: HelpScreenshot }) => (
  <>
    {shot.markers?.map((marker) => (
      <span
        key={marker.number}
        aria-hidden="true"
        className="pointer-events-none absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground ring-1 ring-background shadow-sm"
        style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      >
        {marker.number}
      </span>
    ))}
  </>
);

/** Percent box styles that show only `crop` of a segment, scaled to the container width. */
export const segmentStyles = (s: HelpScreenshotSegment) => ({
  box: { aspectRatio: `${s.crop.width} / ${s.crop.height}` },
  img: {
    width: `${(s.naturalWidth / s.crop.width) * 100}%`,
    left: `${(-s.crop.x / s.crop.width) * 100}%`,
    top: `${(-s.crop.y / s.crop.height) * 100}%`,
  },
});

/** Slices stacked with no gap — reads as one long capture. Outer container supplies rounding. */
const StitchedImage = ({ segments, alt }: { segments: HelpScreenshotSegment[]; alt: string }) => (
  <span role="img" aria-label={alt} className="block w-full">
    {segments.map((s, i) => {
      const st = segmentStyles(s);
      return (
        <span key={i} className="relative block w-full overflow-hidden" style={st.box}>
          <img src={s.src} alt="" loading="lazy" className="absolute h-auto max-w-none" style={st.img} />
        </span>
      );
    })}
  </span>
);

/** Large screenshot; tap to enlarge full-screen, tap/Escape/X to dismiss.
 *  With mobileCrop, phones see the cropped area; enlarge always shows the full image. */
export const HelpScreenshotView = ({ shot }: { shot: HelpScreenshot }) => {
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const c = shot.segments ? undefined : shot.mobileCrop;
  if (shot.segments) {
    const segs = shot.segments;
    return (
      <figure className={shot.device === "mobile" ? "mx-auto w-[94%] max-w-[380px]" : "mx-auto w-[94%] md:w-full"}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Enlarge screenshot: ${shot.alt}`}
        >
          <StitchedImage segments={segs} alt={shot.alt} />
        </button>
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">{shot.caption ?? "Tap to enlarge"}</figcaption>
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/90" />
            <DialogPrimitive.Content
              className="fixed inset-0 z-50 overflow-auto overscroll-contain focus:outline-none"
              onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              <DialogPrimitive.Title className="sr-only">{shot.alt}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Enlarged screenshot. Tap outside or press Escape to close.</DialogPrimitive.Description>
              <div className="flex min-h-full items-start justify-center px-[2.5vw] pb-6 pt-14" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
                <div className={shot.device === "mobile" ? "w-[95vw] max-w-[720px] overflow-hidden rounded-lg" : "w-[95vw] overflow-hidden rounded-lg"}>
                  <StitchedImage segments={segs} alt={shot.alt} />
                </div>
              </div>
              <DialogPrimitive.Close
                className="fixed right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background text-foreground shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </figure>
    );
  }
  return (
    <figure className={shot.device === "mobile" ? "mx-auto w-[94%] max-w-[380px]" : "mx-auto w-[94%] md:w-full"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Enlarge screenshot: ${shot.alt}`}
      >
        {c ? (
          <span
            className="relative block w-full overflow-hidden md:hidden"
            style={{ aspectRatio: dims ? `${c.width * dims.w} / ${c.height * dims.h}` : `${c.width} / ${c.height}` }}
          >
            <img
              src={shot.src}
              alt={shot.alt}
              loading="lazy"
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="absolute max-w-none"
              style={{
                width: `${10000 / c.width}%`,
                height: `${10000 / c.height}%`,
                left: `${(-c.x * 100) / c.width}%`,
                top: `${(-c.y * 100) / c.height}%`,
              }}
            />
            <ScreenshotMarkers shot={shot} />
          </span>
        ) : null}
        <span className={c ? "relative hidden md:block" : "relative block"}>
          <img src={shot.src} alt={c ? "" : shot.alt} loading="lazy" className="block h-auto w-full" />
          <ScreenshotMarkers shot={shot} />
        </span>
      </button>
      {shot.markers?.length ? (
        <ol className={shot.markers.some((m) => m.icon) ? "mt-4 space-y-3" : "mt-3 space-y-2 text-sm md:hidden"} aria-label="Screenshot callouts">
          {shot.markers.map((marker) => (
            <li key={marker.number} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{marker.number}</span>
              {marker.icon ? <span className="flex w-[92px] shrink-0 justify-center"><ControlPreview icon={marker.icon} /></span> : null}
              <span className="min-w-0">
                {marker.icon ? <><strong className="block">{marker.label}</strong><span className="text-muted-foreground">{marker.text}</span></> : <><strong>{marker.label}:</strong> {marker.text}</>}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <figcaption className="mt-2 text-center text-sm text-muted-foreground">
        {shot.caption ?? (c ? <><span className="md:hidden">Tap to see the full screen</span><span className="hidden md:inline">Tap to enlarge</span></> : "Tap to enlarge")}
      </figcaption>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/90" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 overflow-auto overscroll-contain focus:outline-none"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <DialogPrimitive.Title className="sr-only">{shot.alt}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Enlarged screenshot. Tap outside or press Escape to close.</DialogPrimitive.Description>
            <div
              className="flex min-h-full items-start justify-center px-[2.5vw] pb-6 pt-14"
              onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              <div className={shot.device === "mobile" ? "relative w-[95vw] max-w-[720px]" : "relative w-[95vw]"}>
                <img src={shot.src} alt={shot.alt} className="block h-auto w-full rounded-lg" />
                <ScreenshotMarkers shot={shot} />
              </div>
            </div>
            <DialogPrimitive.Close
              className="fixed right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background text-foreground shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </figure>
  );
};
