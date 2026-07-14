import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Wraps children and only renders them for admin/office roles.
 * Engineers are redirected to /dashboard with a toast.
 */
const OfficeRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { role, canAccessOffice, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();
  const toastShown = useRef(false);

  // Engineers with can_access_office=true are permitted into office views.
  // Aligns with resolveLandingPath's post-login rule.
  const isRestricted =
    !authLoading && !roleLoading && role === "engineer" && !canAccessOffice;

  useEffect(() => {
    if (isRestricted && !toastShown.current) {
      toastShown.current = true;
      toast({
        title: "Access restricted to office users.",
        variant: "destructive",
      });
    }
  }, [isRestricted, toast]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isRestricted) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default OfficeRoute;
