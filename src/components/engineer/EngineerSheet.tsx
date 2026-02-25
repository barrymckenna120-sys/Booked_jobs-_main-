import { ReactNode } from "react";

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
}

const EngineerSheet = ({ onClose, children }: SheetProps) => (
  <div
    className="fixed inset-0 z-[500] bg-foreground/60 backdrop-blur-sm flex flex-col justify-end"
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className="bg-card rounded-t-3xl max-h-[94vh] overflow-y-auto pb-14 animate-in slide-in-from-bottom-4 duration-300">
      <div className="pt-3.5 flex justify-center">
        <div className="w-10 h-1 rounded-full bg-border" />
      </div>
      {children}
    </div>
  </div>
);

export default EngineerSheet;
