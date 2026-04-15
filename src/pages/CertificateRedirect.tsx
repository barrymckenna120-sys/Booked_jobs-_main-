import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const CertificateRedirect = () => {
  const { certNumber } = useParams<{ certNumber: string }>();

  useEffect(() => {
    if (!certNumber) return;
    const cleanNumber = certNumber.replace(/\.pdf$/i, "");
    window.location.href = `https://ktkfuquqxbrmuqrmbmdj.supabase.co/storage/v1/object/public/certificates/${encodeURIComponent(cleanNumber)}.pdf`;
  }, [certNumber]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default CertificateRedirect;
