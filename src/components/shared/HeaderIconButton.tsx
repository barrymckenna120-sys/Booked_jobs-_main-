import { forwardRef } from "react";

interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Highlighted (current route) state — one standard treatment everywhere. */
  active?: boolean;
  /** Header sits on a coloured/gradient background (engineer app). */
  tone?: "default" | "onColor";
}

/**
 * The one header control used in both app shells: fixed 44x44 minimum tap
 * target, consistent radius, hover and active styling. Icon sizing is owned
 * here so every header icon matches.
 */
const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ active = false, tone = "default", className = "", children, ...rest }, ref) => {
    const toneClasses =
      tone === "onColor"
        ? active
          ? "text-white bg-white/20"
          : "text-white/75 hover:text-white hover:bg-white/10 active:bg-white/20"
        : active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-muted";

    return (
      <button
        ref={ref}
        {...rest}
        className={`relative shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] rounded-lg text-xs font-semibold transition-colors [&_svg]:w-5 [&_svg]:h-5 [&_svg]:shrink-0 ${toneClasses} ${className}`}
      >
        {children}
      </button>
    );
  }
);

HeaderIconButton.displayName = "HeaderIconButton";

export default HeaderIconButton;
