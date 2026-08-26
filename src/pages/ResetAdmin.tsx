import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const ResetAdmin = () => {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      "barrymckenna120@gmail.com",
      { redirectTo: "https://kngasservices.bookedjobs.ie/reset-password" }
    );
    setLoading(false);
    if (!error) {
      setSent(true);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="flex flex-col items-center gap-4 p-8">
        {sent ? (
          <p className="text-green-600 font-medium">Password reset email sent.</p>
        ) : (
          <Button onClick={handleClick} disabled={loading}>
            {loading ? "Sending…" : "Send Password Reset Email"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ResetAdmin;
