import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface OverflowMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Renders a divider above this item. */
  separatorBefore?: boolean;
}

interface HeaderOverflowMenuProps {
  items: OverflowMenuItem[];
  label?: string;
}

/**
 * The single "More" menu in the mobile header. Holds the low-frequency
 * utilities so the header row can never crowd or wrap at 320px.
 */
const HeaderOverflowMenu = ({ items, label = "More" }: HeaderOverflowMenuProps) => {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="flex shrink-0 items-center justify-center min-w-[40px] min-h-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:opacity-70 transition-colors"
        >
          <MoreVertical className="w-5 h-5" strokeWidth={2.25} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 z-50">
        {items.map((item) => (
          <div key={item.label}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={item.onSelect} className="gap-2.5 font-medium">
              <item.icon className="w-4 h-4 text-muted-foreground" />
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default HeaderOverflowMenu;
