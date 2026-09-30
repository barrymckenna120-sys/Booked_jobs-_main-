import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getHelpReturn } from "@/help/returnPath";

/** Auth-protected shell: useAuth redirects signed-out visitors to /auth. */
const HelpLayout = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const exitHelp = () => navigate(getHelpReturn());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3">
          <button
            type="button"
            onClick={exitHelp}
            className="flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to BookedJobs
          </button>
          {pathname !== "/help" && (
            <Link
              to="/help"
              className="flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
              All Guides
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5 text-[17px] leading-relaxed md:px-6">
        <Outlet />
      </main>
    </div>
  );
};

export default HelpLayout;
