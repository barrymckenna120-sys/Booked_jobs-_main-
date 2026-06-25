import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SuperAdminRoute = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        if (!cancelled) {
          setAuthorized(false);
          setAuthChecked(true);
          navigate("/dashboard", { replace: true });
        }
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError || !profile) {
        if (!cancelled) {
          setAuthorized(false);
          setAuthChecked(true);
          navigate("/dashboard", { replace: true });
        }
        return;
      }
      if (profile.role === "superadmin") {
        if (!cancelled) {
          setAuthorized(true);
          setAuthChecked(true);
        }
      } else {
        if (!cancelled) {
          setAuthorized(false);
          setAuthChecked(true);
          navigate("/dashboard", { replace: true });
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  if (!authChecked || !authorized) {
    return null;
  }

  return <Outlet />;
};

export default SuperAdminRoute;
