import bookedJobsMark from "@/assets/bookedjobs-logo.jpg";

const WORDMARK_URL =
  "https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png";

interface AppLogoProps {
  /** onColor headers show the square mark + light label instead of the wordmark. */
  variant?: "default" | "onColor";
  className?: string;
}

/**
 * Single logo component for both app shells. Never clipped, never squeezed:
 * the square mark is used on the narrowest phones and the full wordmark
 * appears once there is room for it.
 */
const AppLogo = ({ variant = "default", className = "" }: AppLogoProps) => {
  if (variant === "onColor") {
    return (
      <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
        <img
          src={bookedJobsMark}
          alt="BookedJobs"
          className="w-8 h-8 rounded-lg object-cover shrink-0"
        />
        <span className="hidden sm:inline text-white/80 text-sm font-semibold truncate">
          BookedJobs
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center min-w-0 shrink-0 ${className}`}>
      <img
        src={bookedJobsMark}
        alt="BookedJobs"
        className="xs:hidden w-8 h-8 rounded-lg object-cover shrink-0"
      />
      <img
        src={WORDMARK_URL}
        alt="BookedJobs"
        className="hidden xs:block h-8 w-auto max-w-[150px] object-contain shrink-0"
      />
    </div>
  );
};

export default AppLogo;
