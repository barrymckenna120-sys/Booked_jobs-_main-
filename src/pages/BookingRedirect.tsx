import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function BookingRedirect() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid link");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .rpc("get_booking_link_by_token", { _token: token })
        .maybeSingle();

      if (error || !data) {
        setError("This booking link is invalid or has expired.");
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError("This booking link has expired.");
        return;
      }
      window.location.replace(data.full_url);
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        {error ? (
          <p className="text-foreground">{error}</p>
        ) : (
          <p className="text-muted-foreground">Opening your booking form…</p>
        )}
      </div>
    </div>
  );
}
