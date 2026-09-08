import bookedJobsWordmark from "@/assets/bookedjobs-logo.jpg";

const MARK_URL =
  "https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png";

interface AppLogoProps {
  /** onColor headers show the mark + light label instead of the dark wordmark. */
  variant?: "default" | "onColor";
  className?: string;
}

/**
 * Single logo component for both app shells. Never clipped, never squeezed:
 * the mark is fully contained inside its box, and the label only appears once
 * there is room for it.
 */
const AppLogo = ({ variant = "default", className = "" }: AppLogoProps) => {
  if (variant === "onColor") {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${className}`}>
        <img
          src={MARK_URL}
          alt="BookedJobs"
          className="w-9 h-9 rounded-lg bg-white object-contain p-0.5 shrink-0"
        />
        <span className="hidden xs:inline text-white/85 text-sm font-bold truncate">
          BookedJobs
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center min-w-0 shrink-0 ${className}`}>
      <img
        src={MARK_URL}
        alt="BookedJobs"
        className="xs:hidden w-9 h-9 rounded-lg object-contain shrink-0"
      />
      <img
        src={bookedJobsWordmark}
        alt="BookedJobs"
        className="hidden xs:block h-7 w-auto max-w-[140px] object-contain shrink-0"
      />
    </div>
  );
};

export default AppLogo;
