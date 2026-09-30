import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CircleHelp, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

  const back = () => {
    if (pathname === "/help") navigate(-1);
    else navigate(pathname.split("/").slice(0, -1).join("/") || "/help");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3">
          <button
            type="button"
            onClick={back}
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link to="/help" className="flex items-center gap-2 font-semibold">
            <CircleHelp className="h-5 w-5 text-primary" />
            Help & Training
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5 text-[17px] leading-relaxed md:px-6">
        <Outlet />
      </main>
    </div>
  );
};

export default HelpLayout;
