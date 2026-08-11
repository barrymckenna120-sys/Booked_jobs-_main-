import { Clock, Truck, PackageCheck, XCircle, type LucideProps } from "lucide-react";
import { PART_STATUS_ICON_KEY } from "@/lib/partsStatus";

/**
 * Single source of truth for the part-status glyph, shared by the engineer card
 * and the office-side parts surfaces.
 *
 * "Ready to Fit" uses PackageCheck (box with a tick). CheckCircle2 is the job
 * "Complete" glyph elsewhere in the app and is deliberately never used here —
 * the two states must not look alike at a glance on a phone.
 */
const GLYPHS: Record<string, React.ComponentType<LucideProps>> = {
  Clock,
  Truck,
  PackageCheck,
  XCircle,
};

export const partStatusGlyph = (status: string): React.ComponentType<LucideProps> =>
  GLYPHS[PART_STATUS_ICON_KEY[status as keyof typeof PART_STATUS_ICON_KEY]] ?? Clock;

interface Props extends LucideProps {
  status: string;
}

const PartStatusIcon = ({ status, ...props }: Props) => {
  const Glyph = partStatusGlyph(status);
  return <Glyph {...props} />;
};

export default PartStatusIcon;
