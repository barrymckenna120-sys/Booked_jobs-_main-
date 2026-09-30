import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Expand, Minus, Plus, RotateCcw, X, Wrench, ArrowLeft, Bell, MoreVertical } from "lucide-react";
import type { HelpScreenshot, HelpScreenshotMarker, HelpScreenshotSegment } from "@/help/types";
import { Button } from "@/components/ui/button";

export const HELP_SCREENSHOT_MAX_ZOOM = 5;

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
  <span role="img" aria-label={alt} className="block w-full select-none">
    {segments.map((s, i) => {
      const st = segmentStyles(s);
      return (
        <span key={i} className="relative block w-full overflow-hidden" style={st.box}>
          <img src={s.src} alt="" className="absolute h-auto max-w-none" style={st.img} />
        </span>
      );
    })}
  </span>
);

const FullScreenshot = ({ shot }: { shot: HelpScreenshot }) => {
  if (shot.segments) return <StitchedImage segments={shot.segments} alt={shot.alt} />;
  return (
    <span className="relative block w-full">
      <img src={shot.src} alt={shot.alt} draggable={false} className="block h-auto w-full select-none" />
      <ScreenshotMarkers shot={shot} />
    </span>
  );
};

const ScreenshotViewer = ({ shot, open, onOpenChange }: { shot: HelpScreenshot; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const [scale, setScale] = useState(1);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => {
      if (!next) setScale(1);
      onOpenChange(next);
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/90" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-hidden focus:outline-none">
          <DialogPrimitive.Title className="sr-only">{shot.alt}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Full-resolution screenshot. Pinch or use the controls to zoom, then drag to move around it.</DialogPrimitive.Description>
          <TransformWrapper
            initialScale={1}
            minScale={1}
            maxScale={HELP_SCREENSHOT_MAX_ZOOM}
            centerOnInit
            centerZoomedOut
            limitToBounds
            smooth
            wheel={{ step: 0.15 }}
            pinch={{ step: 5, allowPanning: true }}
            panning={{ velocityDisabled: true }}
            doubleClick={{ mode: "toggle", step: 1.5 }}
            keyboard={{ disabled: false, panStep: 50, zoomStep: 0.5 }}
            onTransform={(_ref, state) => setScale(state.scale)}
          >
            {({ zoomIn, zoomOut, fitToView }) => (
              <>
                <div
                  className="fixed left-3 z-[60] flex items-center gap-1 rounded-lg bg-background p-1 shadow-lg md:left-1/2 md:-translate-x-1/2"
                  style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
                  aria-label="Image zoom controls"
                >
                  <Button type="button" variant="ghost" size="icon" onClick={() => zoomOut(0.5)} disabled={scale <= 1.01} aria-label="Zoom out">
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="w-12 text-center text-xs font-semibold tabular-nums" aria-live="polite">{Math.round(scale * 100)}%</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => zoomIn(0.5)} disabled={scale >= HELP_SCREENSHOT_MAX_ZOOM - 0.01} aria-label="Zoom in">
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => fitToView({ mode: "contain" })} disabled={scale <= 1.01} aria-label="Fit image to screen">
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </div>
                <TransformComponent
                  wrapperClass="!fixed !inset-x-0 !bottom-0 !w-full !overflow-hidden !touch-none"
                  contentClass="!w-full !items-start !justify-center"
                  wrapperStyle={{ top: "calc(env(safe-area-inset-top) + 4.5rem)" }}
                  wrapperProps={{
                    "aria-label": "Zoomable screenshot",
                    onClick: (event) => {
                      if (event.target === event.currentTarget) onOpenChange(false);
                    },
                  }}
                >
                  <div className={shot.device === "mobile" ? "w-[95vw] max-w-[720px] overflow-hidden rounded-lg" : "w-[95vw] overflow-hidden rounded-lg"}>
                    <FullScreenshot shot={shot} />
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="fixed right-3 z-[70] h-11 w-11 rounded-full bg-background shadow-lg"
              style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
              aria-label="Close enlarged image"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

const EnlargeControl = ({ onClick }: { onClick: () => void }) => (
  <figcaption className="mt-2 flex justify-center">
    <Button type="button" variant="outline" size="sm" onClick={onClick} className="font-semibold">
      <Expand className="h-4 w-4" />
      Enlarge image
    </Button>
  </figcaption>
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
        {shot.caption ? <p className="mt-2 text-center text-sm text-muted-foreground">{shot.caption}</p> : null}
        <EnlargeControl onClick={() => setOpen(true)} />
        <ScreenshotViewer shot={shot} open={open} onOpenChange={setOpen} />
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
      {shot.caption ? <p className="mt-2 text-center text-sm text-muted-foreground">{shot.caption}</p> : null}
      <EnlargeControl onClick={() => setOpen(true)} />
      <ScreenshotViewer shot={shot} open={open} onOpenChange={setOpen} />
    </figure>
  );
};
