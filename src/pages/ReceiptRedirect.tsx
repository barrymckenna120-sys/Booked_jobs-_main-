import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ReceiptRedirect = () => {
  const { receiptNumber } = useParams<{ receiptNumber: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!receiptNumber) return;
    (async () => {
      const cleanNumber = decodeURIComponent(receiptNumber).replace(/\.pdf$/i, "");

      const { data } = await supabase
        .from("service_calls")
        .select("receipt_pdf_url")
        .eq("receipt_number", cleanNumber)
        .maybeSingle();

      if (data?.receipt_pdf_url) {
        window.location.replace(data.receipt_pdf_url);
      } else {
        setError(true);
      }
    })();
  }, [receiptNumber]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="border border-border rounded-xl max-w-md w-full p-8 text-center">
        <p className="text-lg font-bold text-foreground">Receipt Not Found</p>
        <p className="text-sm text-muted-foreground mt-2">This receipt link is no longer valid or the PDF has not been generated yet.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default ReceiptRedirect;
