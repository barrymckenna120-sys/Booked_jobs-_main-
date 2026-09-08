import { forwardRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Highlighted (current route) state — one standard treatment everywhere. */
  active?: boolean;
  /** Header sits on a coloured/gradient background (engineer app). */
  tone?: "default" | "onColor";
  /**
   * Short control name. Rendered as visible text from the tablet breakpoint up
   * and always available as a hover/focus tooltip, so desktop users never have
   * to guess what an icon means. Phones stay icon-only for space.
   */
  label?: string;
  /** Set false to keep the control icon-only at every width (tooltip stays). */
  showLabel?: boolean;
}

/**
 * The one header control used in both app shells: fixed 44x44 minimum tap
 * target, consistent radius, hover and active styling. Icon sizing, the
 * responsive text label and the tooltip are all owned here so every header
 * icon matches.
 */
const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ active = false, tone = "default", label, showLabel = true, className = "", children, ...rest }, ref) => {
    const toneClasses =
      tone === "onColor"
        ? active
          ? "text-white bg-white/20"
          : "text-white/75 hover:text-white hover:bg-white/10 active:bg-white/20"
        : active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-muted";

    const button = (
      <button
        ref={ref}
        aria-label={rest["aria-label"] ?? label}
        {...rest}
        className={`relative shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] rounded-lg text-xs font-semibold transition-colors [&_svg]:w-5 [&_svg]:h-5 [&_svg]:shrink-0 ${
          label && showLabel ? "md:px-2.5" : ""
        } ${toneClasses} ${className}`}
      >
        {children}
        {label && showLabel && <span className="hidden md:inline truncate">{label}</span>}
      </button>
    );

    if (!label) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    );
  }
);

HeaderIconButton.displayName = "HeaderIconButton";

export default HeaderIconButton;
