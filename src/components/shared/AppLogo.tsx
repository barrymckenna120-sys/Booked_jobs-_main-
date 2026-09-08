import bookedJobsWordmark from "@/assets/bookedjobs-logo.jpg";

const MARK_URL =
  "https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png";

interface AppLogoProps {
  /** onColor headers show the mark + light label instead of the dark wordmark. */
  variant?: "default" | "onColor" | "mark";
  /** shell is the shared responsive workspace size; large is for centred identity surfaces. */
  size?: "compact" | "shell" | "large";
  className?: string;
}

const markSizes = {
  compact: "h-8 w-8 p-0.5",
  shell: "h-10 w-10 p-1 md:h-11 md:w-11 md:p-1.5",
  large: "h-12 w-12 p-1",
};

const wordmarkSizes = {
  compact: "h-8 max-w-[144px]",
  shell: "h-9 max-w-[152px] md:h-10 md:max-w-[168px]",
  large: "h-12 max-w-[190px]",
};

/**
 * Single logo component for both app shells. Never clipped, never squeezed:
 * the mark is fully contained inside its box, and the label only appears once
 * there is room for it.
 */
const AppLogo = ({ variant = "default", size = "shell", className = "" }: AppLogoProps) => {
  if (variant === "onColor") {
    return (
      <div className={`flex min-h-10 items-center gap-2 min-w-0 ${className}`}>
        <img
          src={MARK_URL}
          alt="BookedJobs"
          className={`${markSizes[size]} rounded-lg bg-card object-contain shrink-0`}
        />
        <span className="hidden min-[380px]:inline text-primary-foreground/85 text-sm font-bold truncate">
          BookedJobs
        </span>
      </div>
    );
  }

  if (variant === "mark") {
    return (
      <div className={`flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={MARK_URL}
          alt="BookedJobs"
          className={`${markSizes[size]} rounded-lg object-contain shrink-0`}
        />
      </div>
    );
  }

  return (
    <div className={`flex min-h-10 items-center min-w-0 shrink-0 ${className}`}>
      <img
        src={MARK_URL}
        alt="BookedJobs"
        className={`${markSizes[size]} md:hidden rounded-lg object-contain shrink-0`}
      />
      <img
        src={bookedJobsWordmark}
        alt="BookedJobs"
        className={`hidden md:block w-auto ${wordmarkSizes[size]} object-contain object-left shrink-0`}
      />
    </div>
  );
};

export default AppLogo;
