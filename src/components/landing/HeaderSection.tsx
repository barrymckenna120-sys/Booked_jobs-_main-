import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import bookedjobsLogo from "@/assets/bookedjobs-logo.jpg";
import { supabase } from "@/integrations/supabase/client";

export const HeaderSection = () => {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session?.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session?.user));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="section-container pt-6 pb-4 flex items-center justify-between">
      <img src={bookedjobsLogo} alt="BookedJobs" className="h-10 object-contain object-left" />
      <div className="flex items-center gap-3">
        {loggedIn ? (
          <Button size="sm" asChild>
            <a href="/dashboard">Go to Dashboard</a>
          </Button>
        ) : (
          <>
            <a href="/auth" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
              Login
            </a>
            <Button size="sm" asChild>
              <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
                Start 30-Day Trial
              </a>
            </Button>
          </>
        )}
      </div>
    </header>
  );
};
