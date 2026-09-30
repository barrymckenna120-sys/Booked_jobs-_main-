import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { HelpScreenshot } from "@/help/types";

/** Large screenshot; tap to enlarge full-screen, tap/Escape/X to dismiss. */
export const HelpScreenshotView = ({ shot }: { shot: HelpScreenshot }) => {
  const [open, setOpen] = useState(false);
  return (
    <figure className="mx-auto w-[94%] md:w-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Enlarge screenshot: ${shot.alt}`}
      >
        <img src={shot.src} alt={shot.alt} loading="lazy" className="block h-auto w-full" />
      </button>
      <figcaption className="mt-2 text-center text-sm text-muted-foreground">
        {shot.caption ?? "Tap to enlarge"}
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
