import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { HelpScreenshot } from "@/help/types";

/** Large screenshot; tap to enlarge full-screen, tap/Escape/X to dismiss.
 *  With mobileCrop, phones see the cropped area; enlarge always shows the full image. */
export const HelpScreenshotView = ({ shot }: { shot: HelpScreenshot }) => {
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const c = shot.mobileCrop;
  return (
    <figure className="mx-auto w-[94%] md:w-full">
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
          </span>
        ) : null}
        <img src={shot.src} alt={c ? "" : shot.alt} loading="lazy" className={c ? "hidden h-auto w-full md:block" : "block h-auto w-full"} />
      </button>
      <figcaption className="mt-2 text-center text-sm text-muted-foreground">
        {shot.caption ?? (c ? <><span className="md:hidden">Tap to see the full screen</span><span className="hidden md:inline">Tap to enlarge</span></> : "Tap to enlarge")}
      </figcaption>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[98vw] w-auto p-2 sm:p-3">
          <DialogTitle className="sr-only">{shot.alt}</DialogTitle>
          <img
            src={shot.src}
            alt={shot.alt}
            onClick={() => setOpen(false)}
            className="max-h-[88vh] max-w-full h-auto w-auto mx-auto object-contain rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </figure>
  );
};
