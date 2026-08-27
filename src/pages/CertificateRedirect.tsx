import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const CertificateRedirect = () => {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: err } = await supabase.functions.invoke("resolve-document-link", {
        body: { type: "certificate", token },
      });
      const signed = (data as any)?.signed_url;
      if (err || !signed) { setError(true); return; }
      window.location.replace(signed);
    })();
  }, [token]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="border border-border rounded-xl max-w-md w-full p-8 text-center">
        <p className="text-lg font-bold text-foreground">Link not found</p>
        <p className="text-sm text-muted-foreground mt-2">
          This certificate link is no longer valid. Please contact us for a fresh copy.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default CertificateRedirect;
