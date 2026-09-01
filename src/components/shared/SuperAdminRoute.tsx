import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile } from "@/lib/profileCache";


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
      const profile = await fetchProfile(user.id);
      if (!profile || !profile.role) {
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
