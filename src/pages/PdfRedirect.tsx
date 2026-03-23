import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const PdfRedirect = () => {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!quoteNumber) return;
    (async () => {
      const { data: lookup } = await supabase.rpc("get_quote_by_number", { p_quote_number: quoteNumber });
      const quoteId = (lookup as any)?.quote_id;
      if (!quoteId) { setError(true); return; }

      const { data: quote } = await supabase
        .from("quotes")
        .select("pdf_url")
        .eq("id", quoteId)
        .maybeSingle();

      if (quote?.pdf_url) {
        window.location.replace(quote.pdf_url);
      } else {
        setError(true);
      }
    })();
  }, [quoteNumber]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="border border-border rounded-xl max-w-md w-full p-8 text-center">
        <p className="text-lg font-bold text-foreground">PDF Not Found</p>
        <p className="text-sm text-muted-foreground mt-2">This PDF link is no longer valid or has not been generated yet.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default PdfRedirect;
