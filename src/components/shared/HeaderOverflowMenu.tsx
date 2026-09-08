import { MoreVertical, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

export interface OverflowMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Renders a divider above this item. */
  separatorBefore?: boolean;
  /** Highlights the row as the primary action (brand blue). */
  primary?: boolean;
}

interface HeaderOverflowMenuProps {
  items: OverflowMenuItem[];
  label?: string;
}

/**
 * The single "More" menu in the mobile header. Opens as a bottom sheet that
 * pops up from the bottom edge: title row with close button, one row per
 * action with a leading icon, and the sign-out-style action in red.
 */
const HeaderOverflowMenu = ({ items, label = "More" }: HeaderOverflowMenuProps) => {
  if (items.length === 0) return null;
  return (
    <Drawer shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="flex shrink-0 items-center justify-center min-w-[40px] min-h-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:opacity-70 transition-colors"
        >
          <MoreVertical className="w-5 h-5" strokeWidth={2.25} />
        </button>
      </DrawerTrigger>
      <DrawerContent className="rounded-t-2xl border-x-0 border-b-0 min-h-[52vh] max-h-[85vh]">
        <div className="flex min-h-[52vh] max-h-[85vh] flex-col pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between px-4 pt-1 pb-2">
            <DrawerTitle className="text-base font-bold">{label}</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:opacity-70 transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={2.25} />
              </button>
            </DrawerClose>
          </div>
          {(() => {
            const isDestructive = (l: string) => l === "Sign Out" || l === "Log Out";
            const regular = items.filter((i) => !isDestructive(i.label));
            const destructive = items.filter((i) => isDestructive(i.label));
            const renderItem = (item: OverflowMenuItem, showDivider: boolean) => {
              const destructiveItem = isDestructive(item.label);
              const tone = destructiveItem ? "text-destructive" : item.primary ? "text-primary" : "text-foreground";
              const iconTone = destructiveItem ? "text-destructive" : item.primary ? "text-primary" : "text-muted-foreground";
              return (
                <div key={item.label}>
                  {showDivider && <div className="mx-2 my-2 h-px bg-border" />}
                  <DrawerClose asChild>
                    <button
                      type="button"
                      onClick={item.onSelect}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 min-h-[48px] text-[15px] font-semibold active:bg-muted transition-colors ${tone}`}
                    >
                      <item.icon
                        className={`w-5 h-5 shrink-0 ${iconTone}`}
                        strokeWidth={2.25}
                      />
                      {item.label}
                    </button>
                  </DrawerClose>
                </div>
              );
            };
            return (
              <>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2">
                  {regular.map((item) => renderItem(item, !!item.separatorBefore))}
                </div>
                {destructive.length > 0 && (
                  <div className="mt-auto flex flex-col px-2 pt-1">
                    {destructive.map((item, idx) => renderItem(item, idx === 0))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default HeaderOverflowMenu;
