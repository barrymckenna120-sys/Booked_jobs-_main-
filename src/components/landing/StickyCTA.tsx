import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export const StickyCTA = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 500);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
      }`}
    >
      <Button size="lg" className="shadow-lg text-base font-semibold px-8 py-6" asChild>
        <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
          Start 30-Day Trial →
        </a>
      </Button>
    </div>
  );
};
