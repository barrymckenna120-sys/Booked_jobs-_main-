# Engineer video capture freeze on iPhone (PWA) — root cause and fix

## What the code shows

The video flow is: engineer taps Video → phone camera records → the app immediately builds an in-app preview of the raw recording → tap Send → the whole file is uploaded to Cloudinary. Three things in that path are known to lock up an iPhone, and they compound:

1. **The raw recording is played back inside the app.** `VideoUploadSheet` creates a blob URL for the untouched camera file and puts it straight into a `<video>` element with controls. A short iPhone clip is commonly 100–400 MB of HEVC/H.265. Safari has to hold the file and decode it in the same process as the app. On a 4K/HEVC clip this is the single most likely cause of the whole app going unresponsive: WebKit stalls or the page process is killed. In an installed PWA there is no address bar to reload, so a killed page looks exactly like "frozen, can't exit or interact".

2. **The preview is also broken, which is the "flash black".** The blob URL is assigned to a ref inside an effect, so the first paint has an empty source and the video shows black; nothing re-renders to fix it. So the engineer sees a black box and taps around it — while the file is still being held in memory.

3. **The Media grid plays every video at once.** `MediaSheet` renders a real `<video>` element per item (with `preload="metadata"` and an mp4 transcode URL) instead of a still thumbnail. iOS allows only a small number of simultaneous video decoders; a job with several videos will hang or show black tiles. Cloudinary poster images are already available and unused for the grid.

There is also no size or duration limit on the capture, and no way to cancel an upload once started.

## The fix

**A. Stop decoding the raw camera file in-app (the freeze)**
- Remove the full-file `<video>` playback from the send screen. Show a lightweight confirmation card instead: file name, size, duration, and a single still frame captured from the file at low cost (seek to 0.1s, draw one frame, then release the video element immediately).
- If a still frame cannot be produced quickly, fall back to a plain file card — never block on decoding.
- Release the object URL as soon as the frame is drawn, and before the upload starts, so the file is not held twice.

**B. Guard oversized recordings**
- Reject clips over a set size with a clear engineer-facing message ("This video is too large to send — record a shorter clip, about 30 seconds"). Proposed limit: 200 MB.
- Ask iOS for a shorter, smaller capture where the browser honours it, and tell engineers on screen to keep clips short.

**C. Make the Media grid safe**
- Replace the per-item `<video>` tiles with still poster images (Cloudinary already generates these) plus the existing play badge. Only the fullscreen viewer creates a real video element, one at a time.

**D. Upload resilience**
- Keep the existing progress/retry stages, add a Cancel during upload that aborts the request and releases memory.

## Open questions for you (device behaviour)

To confirm the diagnosis matches what you saw, when it next happens:
- Did force-close recover it, and was reopening the app normal afterwards? (Normal after force-close = page process killed, which matches the memory diagnosis.)
- Did it happen on every video attempt or only some? (Every time = the preview decode; only sometimes = memory/clip size, still the same fix.)
- Were OS gestures still working — could you swipe up to the home screen? (If yes, it is the web page frozen, not iOS.)

## Answers to your other questions

- **Camera, preview, or upload?** The capture itself is handled by iOS and is safe. The failure is what the app does immediately after the camera returns: it plays the raw file back. Upload is secondary but adds memory pressure.
- **iOS-specific or also Android?** Primarily iOS Safari: HEVC recordings, a single shared page process, strict per-tab memory limits, and no reload chrome in an installed PWA. Android Chrome handles the same code more gracefully but the video grid can still stutter, so the fix helps both.

## Scope

Front-end only: `VideoUploadSheet.tsx`, `MediaSheet.tsx`, `SecondaryActions.tsx`, small helper additions in `src/lib/cloudinaryUpload.ts`. No change to upload destination, database writes, office media review, or notification behaviour. Steps 2/4/5 from today's mobile sweep stay parked.

## Verification

- Unit tests for the size guard and poster-URL helper.
- Playwright at iPhone widths for the new send screen and the grid (still tiles, one decoder in the viewer).
- Real-device pass on your iPhone with a normal clip and a deliberately long clip, using a scratch job only.
