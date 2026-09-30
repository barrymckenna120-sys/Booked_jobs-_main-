import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { HelpScreenshot } from "@/help/types";

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

/** Large screenshot; tap to enlarge full-screen, tap/Escape/X to dismiss.
 *  With mobileCrop, phones see the cropped area; enlarge always shows the full image. */
export const HelpScreenshotView = ({ shot }: { shot: HelpScreenshot }) => {
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const c = shot.mobileCrop;
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
        <ol className="mt-3 space-y-2 text-sm md:hidden" aria-label="Screenshot callouts">
          {shot.markers.map((marker) => (
            <li key={marker.number} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{marker.number}</span>
              <span><strong>{marker.label}:</strong> {marker.text}</span>
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
