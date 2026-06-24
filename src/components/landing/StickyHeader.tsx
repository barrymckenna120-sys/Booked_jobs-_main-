import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const StickyHeader = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY > 100);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session?.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session?.user));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm shadow-sm transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="section-container py-2 flex items-center justify-between">
        <img src="https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png" alt="BookedJobs" className="h-8 object-contain object-left" />
        <div className="flex items-center gap-3">
          {loggedIn ? (
            <Button size="sm" asChild>
              <a href="/dashboard">Go to Dashboard</a>
            </Button>
          ) : (
            <a href="/auth" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
              Login
            </a>
          )}
        </div>
      </div>
    </header>
  );
};
