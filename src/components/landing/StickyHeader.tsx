import { useState, useEffect } from "react";
import bookedjobsLogo from "@/assets/bookedjobs-logo.jpg";

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
        <img 
          src={bookedjobsLogo} 
          alt="BookedJobs" 
          className="h-8 object-contain object-left"
        />
      </div>
    </header>
  );
};
