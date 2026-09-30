import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PageSeo from "@/components/seo/PageSeo";
import { BJLogo, IOS, PhoneMockup, PhoneStyles, TapMarker, hlStyle } from "@/components/help/PhoneMockup";
import { getSetupGuideHost } from "@/lib/setupGuideHost";

const ACCENT = IOS.accent;

/* ---------- small iOS building blocks (always light) ---------- */
const Site = ({ title = "Sign in", fields = 2, empty }: { title?: string; fields?: number; empty?: boolean }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#fff] px-[22px]">
    {!empty && (
      <>
        <BJLogo />
        <div className="text-[13px] font-bold">{title}</div>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="h-[26px] w-full rounded-[7px] border bg-[#fafafa]" style={{ borderColor: IOS.line }} />
        ))}
        {title === "Sign in" && (
          <div className="grid h-7 w-full place-items-center rounded-[7px] text-[11px] font-bold" style={{ background: IOS.brand, color: "#fff" }}>
            Sign in
          </div>
        )}
      </>
    )}
  </div>
);

const Circ = ({ children, tap }: { children: ReactNode; tap?: boolean }) => (
  <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e9e9ee] text-[12px] font-extrabold">
    {children}
    {tap && <TapMarker />}
  </span>
);

const SafariBar = ({ host, tapMore }: { host: string; tapMore?: boolean }) => (
  <div className="flex shrink-0 items-center gap-[7px] border-t px-[10px] pb-[18px] pt-2" style={{ background: "rgba(248,248,250,.96)", borderColor: IOS.line }}>
    <Circ>‹</Circ>
    <span className="block h-7 min-w-0 flex-1 truncate rounded-[14px] bg-[#e9e9ee] px-2 text-center text-[9.5px] leading-7">{host}</span>
    <Circ tap={tapMore}>•••</Circ>
  </div>
);

const Dim = () => <div className="absolute inset-0 z-[2]" style={{ background: "rgba(0,0,0,.18)" }} />;

const Switch = () => (
  <span className="relative h-5 w-[34px] shrink-0 rounded-[10px]" style={{ background: IOS.green }}>
    <span className="absolute right-[2px] top-[2px] h-4 w-4 rounded-full bg-[#fff] shadow-[0_1px_2px_rgba(0,0,0,.25)]" />
  </span>
);

const Row = ({ children, style, className = "" }: { children: ReactNode; style?: CSSProperties; className?: string }) => (
  <div className={`relative flex items-center justify-between gap-2 border-t px-[11px] py-[9px] first:border-t-0 ${className}`} style={{ borderColor: IOS.line, ...style }}>
    {children}
  </div>
);

const Group = ({ children }: { children: ReactNode }) => (
  <div className="mx-[10px] my-[6px] rounded-[10px]" style={{ background: IOS.card }}>{children}</div>
);

const Icon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] fill-none stroke-current" strokeWidth={2}>{d}</svg>
);

const HomeIcon = ({ label }: { label: string }) => (
  <span className="flex flex-col items-center gap-[3px] text-[8.5px] text-[#fff]">
    <span className="h-[38px] w-[38px] rounded-[10px]" style={{ background: "rgba(255,255,255,.28)" }} />
    {label}
  </span>
);

/* ---------- the 8 screens ---------- */
const screens = (host: string): { title: string; sub?: string; phone: ReactNode }[] => [
  {
    title: "Open Safari, sign in, tap •••",
    sub: "Use your company's BookedJobs address",
    phone: (
      <PhoneMockup>
        <Site />
        <SafariBar host={host} tapMore />
      </PhoneMockup>
    ),
  },
  {
    title: "Tap Share",
    phone: (
      <PhoneMockup>
        <Site />
        <SafariBar host={host} />
        <Dim />
        <div className="absolute bottom-[58px] right-3 z-[3] w-[150px] rounded-[13px] shadow-[0_8px_24px_rgba(0,0,0,.2)]" style={{ background: "rgba(250,250,252,.98)" }}>
          <Row style={hlStyle}><span>Share</span><Icon d={<path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" />} /><TapMarker /></Row>
          {["Add Bookmark", "Add to Favourites", "Find on Page"].map((t) => (
            <Row key={t} className="opacity-45"><span>{t}</span></Row>
          ))}
        </div>
      </PhoneMockup>
    ),
  },
  {
    title: "Scroll down, tap Add to Home Screen",
    phone: (
      <PhoneMockup>
        <Site empty />
        <Dim />
        <div className="absolute inset-x-0 bottom-0 top-[70px] z-[3] flex flex-col gap-[10px] rounded-t-[14px] px-[10px] py-3 shadow-[0_-4px_20px_rgba(0,0,0,.15)]" style={{ background: IOS.scr }}>
          <div className="flex items-center gap-2 rounded-[10px] p-[7px]" style={{ background: IOS.card }}>
            <BJLogo size={28} radius={7} font={10} />
            <div className="min-w-0"><b>BookedJobs</b><div className="truncate text-[9px]" style={{ color: IOS.muted }}>{host}</div></div>
          </div>
          <div className="flex justify-between px-1">
            {["AirDrop", "Messages", "Mail", "Notes"].map((a) => (
              <span key={a} className="flex flex-col items-center gap-[3px] text-[8.5px]" style={{ color: IOS.muted }}>
                <span className="h-[34px] w-[34px] rounded-[9px] bg-[#d9d9e0]" />{a}
              </span>
            ))}
          </div>
          <div className="rounded-[10px]" style={{ background: IOS.card }}>
            {["Copy", "Add to Reading List", "Add Bookmark"].map((t) => (
              <Row key={t} className="opacity-45"><span>{t}</span></Row>
            ))}
            <Row style={hlStyle}>
              <b>Add to Home Screen</b>
              <Icon d={<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>} />
              <TapMarker />
            </Row>
          </div>
        </div>
      </PhoneMockup>
    ),
  },
  {
    title: '"Open as Web App" ON, tap Add',
    sub: "If it's off, notifications won't work",
    phone: (
      <PhoneMockup>
        <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[11px]">
          <span style={{ color: IOS.blue }}>Cancel</span>
          <span className="font-bold">Add to Home</span>
          <span className="relative px-2 py-1 font-bold" style={{ color: IOS.blue }}>Add<TapMarker /></span>
        </div>
        <div className="mx-[10px] my-[6px] flex items-center gap-[10px] rounded-[10px] p-[10px]" style={{ background: IOS.card }}>
          <BJLogo size={44} font={14} />
          <div className="min-w-0 flex-1">
            <div className="border-b pb-[5px] text-[12px] font-semibold" style={{ borderColor: IOS.line }}>BookedJobs</div>
            <div className="mt-[5px] truncate text-[9px]" style={{ color: IOS.muted }}>{host}</div>
          </div>
        </div>
        <Group><Row style={hlStyle}><b>Open as Web App</b><Switch /></Row></Group>
        <p className="mx-4 my-[2px] text-[9px]" style={{ color: IOS.muted }}>Keep this switched ON</p>
      </PhoneMockup>
    ),
  },
  {
    title: "Open from the new icon and sign in again",
    sub: "Always use this icon from now on",
    phone: (
      <PhoneMockup statusStyle={{ background: "#3d6b8c", color: "#fff" }}>
        <div className="flex flex-1 flex-col justify-between px-4 pb-[14px] pt-[18px]" style={{ background: "linear-gradient(160deg,#3d6b8c,#22405a 55%,#1b2f44)" }}>
          <div className="grid grid-cols-4 gap-x-[10px] gap-y-[14px]">
            {["Phone", "Maps", "Camera", "Photos", "Clock", "Notes", "Settings"].map((l) => <HomeIcon key={l} label={l} />)}
            <span className="relative flex flex-col items-center gap-[3px] text-[8.5px] text-[#fff]">
              <BJLogo size={38} radius={10} font={13} style={{ boxShadow: "0 0 0 2px #fff" }} />
              BookedJobs
              <TapMarker />
            </span>
          </div>
          <div className="flex justify-around rounded-[22px] p-[9px]" style={{ background: "rgba(255,255,255,.22)" }}>
            {[0, 1, 2, 3].map((i) => <span key={i} className="h-[38px] w-[38px] rounded-[10px]" style={{ background: "rgba(255,255,255,.35)" }} />)}
          </div>
        </div>
      </PhoneMockup>
    ),
  },
  {
    title: "Tap Allow",
    phone: (
      <PhoneMockup>
        <Site title="Today's jobs" fields={3} />
        <Dim />
        <div className="absolute left-1/2 top-1/2 z-[3] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-[13px] text-center shadow-[0_10px_30px_rgba(0,0,0,.25)]" style={{ background: "rgba(245,245,247,.98)" }}>
          <div className="px-3 pb-[10px] pt-3 text-[10.5px]">
            <b className="mb-[3px] block text-[11.5px]">"BookedJobs" Would Like to Send You Notifications</b>
            Alerts, sounds and icon badges.
          </div>
          <div className="flex border-t" style={{ borderColor: IOS.line, color: IOS.blue }}>
            <span className="flex-1 py-[9px]">Don't Allow</span>
            <span className="relative flex-1 border-l py-[9px] font-bold" style={{ borderColor: IOS.line }}>Allow<TapMarker /></span>
          </div>
        </div>
      </PhoneMockup>
    ),
  },
  {
    title: "Check: Settings › Notifications › BookedJobs",
    sub: "Everything on, like this",
    phone: (
      <PhoneMockup>
        <div className="px-3 pt-[6px] text-[11px]" style={{ color: IOS.blue }}>‹ Notifications</div>
        <div className="px-[14px] pb-[6px] pt-[2px] text-[18px] font-extrabold">BookedJobs</div>
        <Group><Row style={hlStyle}><span>Allow Notifications</span><Switch /></Row></Group>
        <Group>
          <div className="flex justify-around px-[6px] py-[10px]">
            {["Lock Screen", "Centre", "Banners"].map((l) => (
              <span key={l} className="flex flex-col items-center gap-1 text-[8px]">
                <span className="h-10 w-[26px] rounded-[5px] border-[1.5px] border-[#c7c7cc]" />
                {l}
                <em className="text-[11px] font-extrabold not-italic" style={{ color: IOS.blue }}>✓</em>
              </span>
            ))}
          </div>
          <Row><span>Banner Style</span><span style={{ color: IOS.muted }}>Persistent ›</span></Row>
        </Group>
        <Group>
          <Row style={hlStyle}><span>Sounds</span><Switch /></Row>
          <Row><span>Badges</span><Switch /></Row>
        </Group>
      </PhoneMockup>
    ),
  },
  {
    title: "Done: job alerts on your lock screen",
    sub: "Ask the office to send a test",
    phone: (
      <PhoneMockup statusStyle={{ background: "#26455f", color: "#fff" }} hideTime>
        <div className="flex flex-1 flex-col items-center gap-[2px] pt-7 text-[#fff]" style={{ background: "linear-gradient(170deg,#26455f,#11202f)" }}>
          <div className="text-[11px] opacity-85">Wednesday 30 September</div>
          <div className="text-[48px] font-bold leading-none tracking-[-1px]">9:41</div>
          <div className="mb-[70px] mt-auto flex w-[calc(100%-20px)] gap-2 rounded-[14px] p-[9px] text-[#111]" style={{ background: "rgba(255,255,255,.88)" }}>
            <BJLogo size={28} radius={7} font={10} />
            <div className="min-w-0">
              <b className="flex justify-between text-[10.5px]">BookedJobs <i className="text-[9px] font-normal not-italic text-[#666]">now</i></b>
              <p className="text-[10px]">New job: boiler service, Thu 9am–11am</p>
            </div>
          </div>
        </div>
      </PhoneMockup>
    ),
  },
];

const FIXES: [string, string][] = [
  ['No "Add to Home Screen"', "Open the link in Safari, not WhatsApp or Chrome."],
  ["Address bar shows in the app", "Delete the icon, redo step 4 with the switch on."],
  ["No alerts", "Turn off Focus / Do Not Disturb, or allow BookedJobs in Settings › Focus."],
  ["Alerts stopped", "You signed in on another phone. Sign in again on this one."],
  ["Older iPhone, no •••", "Tap Share at the bottom of Safari, then go to step 3."],
];

const CHECKS = [
  "Opens from icon, no address bar",
  "Signed in inside the icon app",
  "Test alert heard with phone locked",
  "Only one BookedJobs icon",
];

const IphoneSetup = () => {
  const host = getSetupGuideHost();
  const [done, setDone] = useState<boolean[]>(() => CHECKS.map(() => false));
  const count = done.filter(Boolean).length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <PageSeo
        title="iPhone setup — BookedJobs"
        description="How to add BookedJobs to your iPhone Home Screen and turn on job alerts."
        path="/help/iphone-setup"
      />
      <PhoneStyles />
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 pb-12 pt-6">
        <Link to="/auth" className="text-sm font-semibold text-primary hover:underline">← Back to sign in</Link>

        <header className="flex flex-col gap-1.5">
          <div className="text-[.76rem] font-bold uppercase tracking-[.08em]" style={{ color: ACCENT }}>BookedJobs · iPhone 14 and newer</div>
          <h1 className="text-[2rem] font-bold leading-[1.1] [text-wrap:balance]">Add BookedJobs to your Home Screen</h1>
          <p className="text-muted-foreground">Follow the orange circles.</p>
        </header>

        <div className="flex flex-wrap gap-2">
          {["Safari only", "Not Private mode", "iPhone updated"].map((c) => (
            <span key={c} className="rounded-full border border-border bg-card px-3 py-[5px] text-[.88rem] font-bold">{c}</span>
          ))}
        </div>

        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-5 gap-y-7 p-0">
          {screens(host).map((s, i) => (
            <li key={i} className="flex flex-col items-center gap-3">
              {s.phone}
              <div className="flex w-full max-w-[250px] items-start gap-2.5">
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-bold text-[#fff]" style={{ background: ACCENT }}>{i + 1}</span>
                <div>
                  <b className="block text-[1.12rem] leading-[1.2]">{s.title}</b>
                  {s.sub && <small className="mt-0.5 block text-[.86rem] text-muted-foreground">{s.sub}</small>}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <section className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
            <h2 className="text-[1.4rem] font-bold leading-[1.1]">Not working?</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {FIXES.map(([b, t]) => (
                <li key={b} className="grid gap-px border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <b className="text-[.95rem]">{b}</b>
                  <span className="text-[.9rem] text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
            <h2 className="text-[1.4rem] font-bold leading-[1.1]">Checklist</h2>
            <p className="font-bold text-emerald-700 dark:text-emerald-400" aria-live="polite">
              {count === CHECKS.length ? "All done" : `${count} of ${CHECKS.length} done`}
            </p>
            {CHECKS.map((c, i) => (
              <label key={c} className="flex cursor-pointer items-center gap-2.5 text-[.95rem]">
                <input
                  type="checkbox"
                  className="h-[22px] w-[22px] shrink-0 accent-emerald-700"
                  checked={done[i]}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setDone((d) => d.map((x, j) => (j === i ? v : x)));
                  }}
                />
                <span className={done[i] ? "text-muted-foreground line-through" : ""}>{c}</span>
              </label>
            ))}
            <p className="rounded-lg border-l-4 border-amber-700 bg-amber-50 px-3 py-2.5 text-[.92rem] dark:border-amber-400 dark:bg-amber-950/40">
              Only one phone per engineer login gets alerts: the last one you signed in on.
            </p>
          </section>
        </div>

        <footer className="text-[.82rem] text-muted-foreground">BookedJobs · iPhone setup · updated 30/09/26</footer>
      </div>
    </main>
  );
};

export default IphoneSetup;
