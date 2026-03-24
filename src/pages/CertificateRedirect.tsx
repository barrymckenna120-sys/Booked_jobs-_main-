import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const CertificateRedirect = () => {
  const { certNumber } = useParams<{ certNumber: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!certNumber) return;
    (async () => {
      // Strip .pdf extension if present
      const cleanNumber = certNumber.replace(/\.pdf$/i, "");
      
      const { data } = await supabase
        .from("certificates")
        .select("pdf_url")
        .eq("cert_number", cleanNumber)
        .maybeSingle();

      if (data?.pdf_url) {
        window.location.replace(data.pdf_url);
      } else {
        setError(true);
      }
    })();
  }, [certNumber]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="border border-border rounded-xl max-w-md w-full p-8 text-center">
        <p className="text-lg font-bold text-foreground">Certificate Not Found</p>
        <p className="text-sm text-muted-foreground mt-2">This certificate link is no longer valid or has not been generated yet.</p>
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
