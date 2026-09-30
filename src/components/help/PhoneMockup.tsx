import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * iPhone frame for the public setup guide. Screens always render in iOS light
 * appearance, so the colours below are fixed on purpose (not theme tokens).
 */
export const IOS = {
  bezel: "#1c1f24",
  scr: "#f2f2f7",
  card: "#ffffff",
  ink: "#111111",
  muted: "#8a8a8e",
  line: "#e3e3e8",
  blue: "#0a7aff",
  green: "#34c759",
  brand: "#1f3a5f",
  accent: "#e0561b",
} as const;

const IOS_FONT = '-apple-system, "SF Pro Text", system-ui, "Helvetica Neue", sans-serif';

/** Pulse keyframe; animation only runs when reduced motion is not requested. */
const TAP_STYLES = `
@keyframes bj-tap-pulse { 0% { transform: scale(.7); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: no-preference) { .bj-tap-ring { animation: bj-tap-pulse 1.6s ease-out infinite; } }
`;

export const PhoneStyles = () => <style>{TAP_STYLES}</style>;

/** Orange tap circle centred on its parent (parent needs `relative`). */
export const TapMarker = () => (
  <span
    aria-hidden="true"
    className="bj-tap-ring pointer-events-none absolute left-1/2 top-1/2 z-[4] -ml-[17px] -mt-[17px] h-[34px] w-[34px] rounded-full border-[3px]"
    style={{ borderColor: IOS.accent, background: `${IOS.accent}38` }}
  />
);

/** Orange highlight outline for a tapped row. */
export const hlStyle: CSSProperties = { outline: `2px solid ${IOS.accent}`, outlineOffset: -2, borderRadius: 8 };

export const BJLogo = ({ size = 42, radius = 11, font = 15, className, style }: {
  size?: number; radius?: number; font?: number; className?: string; style?: CSSProperties;
}) => (
  <div
    className={cn("grid shrink-0 place-items-center font-extrabold", className)}
    style={{ width: size, height: size, borderRadius: radius, fontSize: font, background: IOS.brand, color: "#fff", ...style }}
  >
    BJ
  </div>
);

export const PhoneMockup = ({ children, statusStyle, hideTime }: {
  children: ReactNode; statusStyle?: CSSProperties; hideTime?: boolean;
}) => (
  <div
    aria-hidden="true"
    className="aspect-[9/19] w-[230px] max-w-full rounded-[38px] p-[9px] shadow-[0_10px_30px_rgba(0,0,0,.18)]"
    style={{ background: IOS.bezel }}
  >
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[30px] text-[11px]"
      style={{ background: IOS.scr, color: IOS.ink, fontFamily: IOS_FONT }}
    >
      <div className="absolute left-1/2 top-[7px] z-[5] h-[18px] w-16 -translate-x-1/2 rounded-xl bg-[#000]" />
      <div
        className="flex h-8 shrink-0 items-center justify-between px-5 pt-1 text-[10.5px] font-semibold"
        style={statusStyle}
      >
        <span>{hideTime ? "" : "9:41"}</span>
        <i className="not-italic tracking-[1px]">▮▮▮</i>
      </div>
      {children}
    </div>
  </div>
);
