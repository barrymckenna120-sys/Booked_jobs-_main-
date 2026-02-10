import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export const StickyHeader = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm shadow-sm transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="section-container py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-cta" />
          <span className="text-xl font-bold text-heading">BookedJobs</span>
        </div>
      </div>
    </header>
  );
};
