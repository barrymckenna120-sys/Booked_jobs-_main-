import { CheckCircle2 } from "lucide-react";

type Props = {
  confirmed?: boolean | null;
  confirmedAt?: string | null;
  /** sm = icon-only pill for dense grids, md = icon + label. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Appointment-confirmed indicator. Renders nothing unless the job is confirmed,
 * so screens stay quiet by default. Uses the same cyan pair as the renewal
 * "Confirmed" stage so confirmation looks identical everywhere in the app.
 */
const JobConfirmedBadge = ({ confirmed, confirmedAt, size = "md", className = "" }: Props) => {
  if (!confirmed) return null;

  let title = "Appointment confirmed by customer";
  if (confirmedAt) {
    // T12:00:00 guard so the date can't shift across the timezone boundary.
    const datePart = String(confirmedAt).split("T")[0];
    const d = new Date(`${datePart}T12:00:00`);
    if (!isNaN(d.getTime())) {
      title = `Confirmed on ${d.toLocaleDateString("en-IE")}`;
    }
  }

  if (size === "sm") {
    return (
      <span
        title={title}
        aria-label={title}
        className={`inline-flex items-center justify-center rounded-full bg-[#CFFAFE] text-[#0891B2] w-4 h-4 shrink-0 ${className}`}
      >
        <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full bg-[#CFFAFE] text-[#0891B2] text-xs font-bold px-2.5 py-0.5 ${className}`}
    >
      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
      Confirmed
    </span>
  );
};

export default JobConfirmedBadge;
