import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const InvoiceRedirect = () => {
  const { invoiceNumber } = useParams<{ invoiceNumber: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!invoiceNumber) return;
    (async () => {
      const cleanNumber = decodeURIComponent(invoiceNumber).replace(/\.pdf$/i, "");

      const { data } = await supabase
        .from("invoices")
        .select("pdf_url")
        .eq("invoice_number", cleanNumber)
        .maybeSingle();

      if (data?.pdf_url) {
        window.location.replace(data.pdf_url);
      } else {
        setError(true);
      }
    })();
  }, [invoiceNumber]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="border border-border rounded-xl max-w-md w-full p-8 text-center">
        <p className="text-lg font-bold text-foreground">Invoice Not Found</p>
        <p className="text-sm text-muted-foreground mt-2">This invoice link is no longer valid or the PDF has not been generated yet.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default InvoiceRedirect;
