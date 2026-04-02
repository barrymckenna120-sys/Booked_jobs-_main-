import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileX } from "lucide-react";

const CertificateViewer = () => {
  const { certNumber } = useParams<{ certNumber: string }>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!certNumber) { setError(true); setLoading(false); return; }

    const cleanNumber = certNumber.replace(/\.pdf$/i, "");

    supabase.rpc("get_cert_pdf", { p_cert_number: cleanNumber }).then(({ data }) => {
      const result = data as unknown as { pdf_url: string | null } | null;
      if (result?.pdf_url) {
        setPdfUrl(result.pdf_url);
      } else {
        setError(true);
      }
      setLoading(false);
    });
  }, [certNumber]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="border border-border rounded-xl max-w-md w-full p-8 text-center space-y-3">
          <FileX className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-lg font-bold text-foreground">Certificate Not Found</p>
          <p className="text-sm text-muted-foreground">
            The certificate number provided could not be found. Please check the link and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={pdfUrl}
      title={`Certificate ${certNumber}`}
      className="w-screen h-screen border-0"
      style={{ position: "fixed", inset: 0 }}
    />
  );
};

export default CertificateViewer;
