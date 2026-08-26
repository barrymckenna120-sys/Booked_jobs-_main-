import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Download,
  CheckCircle,
  Wrench,
  Shield,
  ShieldOff,
  Calendar,
  Hash,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ROW_ICONS: Record<string, typeof Wrench> = {
  "Make & Model": Wrench,
  Warranty: Shield,
  "Next Service Due": Calendar,
  GPRN: Hash,
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};


const PublicReceipt = () => {
  const { receiptNumber } = useParams<{ receiptNumber: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!receiptNumber) return;
    (async () => {
      const { data: result } = await supabase.rpc("get_receipt_public", {
        p_receipt_number: receiptNumber,
      });
      if (!result || !(result as any)?.receipt_number) {
        setError(true);
      } else {
        setData(result);
      }
      setLoading(false);
    })();
  }, [receiptNumber]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="border border-gray-200 rounded-xl max-w-md w-full p-8 text-center bg-white shadow-sm">
          <p className="text-lg font-bold text-gray-900">Receipt Not Found</p>
          <p className="text-sm text-gray-500 mt-2">
            This receipt link is no longer valid or the receipt number is incorrect.
          </p>
        </div>
      </div>
    );
  }

  const paymentLabel =
    data.payment_method === "cash" ? "Cash" : data.payment_method === "card" ? "Card" : "Invoice";
  const amountSource = data.amount_paid ?? data.revenue;
  const amount = amountSource ? `€${Number(amountSource).toFixed(2)}` : "—";
  const serviceDate = data.scheduled_date || data.completed_at;

  // Boiler Details rows (empty rows are omitted entirely)
  const makeModel = [data.boiler_brand, data.boiler_model].filter(Boolean).join(" ").trim();
  const warrantyText = (() => {
    if (!data.warranty_expiry_date) return null;
    const expiry = new Date(
      String(data.warranty_expiry_date).includes("T")
        ? data.warranty_expiry_date
        : data.warranty_expiry_date + "T00:00:00"
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry >= today
      ? `Under Warranty (until ${formatDate(data.warranty_expiry_date)})`
      : "Warranty Expired";
  })();
  const boilerRows: { label: string; value: string }[] = [
    makeModel ? { label: "Make & Model", value: makeModel } : null,
    warrantyText ? { label: "Warranty", value: warrantyText } : null,
    data.next_service_due
      ? { label: "Next Service Due", value: formatDate(data.next_service_due) }
      : null,
    data.gprn ? { label: "GPRN", value: String(data.gprn) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const notes = (data.customer_facing_notes || "").trim();
  const hasBoiler = boilerRows.length > 0;
  const hasNotes = notes.length > 0;
  // Per-tenant toggle; missing/undefined is treated as enabled.
  const boilerDetailsEnabled = data.receipt_show_boiler_details !== false;
  const showDetailsSection = boilerDetailsEnabled && (hasBoiler || hasNotes);


  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-6 text-center">
          {data.logo_url && (
            <img
              src={data.logo_url}
              alt={data.business_name}
              className="h-12 mx-auto mb-3 object-contain"
            />
          )}
          <h1 className="text-xl font-bold">{data.business_name}</h1>
          <p className="text-blue-200 text-sm mt-1">Payment Receipt</p>
        </div>

        {/* Success badge */}
        <div className="flex items-center justify-center gap-2 py-4 bg-green-50 border-b border-green-100">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-700 font-semibold text-sm">Payment Confirmed</span>
        </div>

        {/* Receipt details */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Receipt No.</p>
              <p className="font-semibold text-gray-900">{data.receipt_number}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Job Ref</p>
              <p className="font-semibold text-gray-900">{data.job_reference || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Date</p>
              <p className="font-semibold text-gray-900">{formatDate(serviceDate)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Payment</p>
              <p className="font-semibold text-gray-900">{paymentLabel}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Customer</p>
            <p className="font-semibold text-gray-900">{data.customer_name}</p>
            <p className="text-gray-500 text-sm">
              {[data.customer_address, data.customer_eircode].filter(Boolean).join(", ")}
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Service</p>
            <p className="font-semibold text-gray-900">{data.job_type || "Boiler Service"}</p>
          </div>

          <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Amount Paid</p>
            <p className="text-2xl font-bold text-gray-900">{amount}</p>
          </div>

          {showDetailsSection && (
            <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={!hasNotes ? "sm:col-span-2" : undefined}>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
                  Boiler Details
                </p>
                <div className="mt-3 space-y-3">
                  {boilerRows.map((row) => {
                    const Icon = ROW_ICONS[row.label] || Wrench;
                    const isWarranty = row.label === "Warranty";
                    const warrantyActive = isWarranty && row.value.startsWith("Under Warranty");
                    const RowIcon = isWarranty ? (warrantyActive ? Shield : ShieldOff) : Icon;
                    return (
                      <div key={row.label} className="flex items-start gap-2">
                        <RowIcon
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                            warrantyActive ? "text-success" : "text-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
                            {row.label}
                          </p>
                          <p
                            className={`text-[13px] font-semibold break-words ${
                              isWarranty
                                ? warrantyActive
                                  ? "text-success"
                                  : "text-muted-foreground"
                                : "text-foreground"
                            }`}
                          >
                            {row.value}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {!hasBoiler && (
                    <p className="text-[12px] italic text-muted-foreground">No details on file</p>
                  )}
                </div>
              </div>
              <div className={!hasBoiler ? "sm:col-span-2" : undefined}>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide mb-2 sm:text-right">
                  Notes
                </p>
                {hasNotes ? (
                  <div className="bg-accent border border-accent-foreground/20 rounded-lg px-3 py-2.5">
                    <div className="flex items-start gap-1.5">
                      <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-accent-foreground" />
                      <p className="text-[12px] leading-snug text-foreground/80 whitespace-pre-line">
                        {notes}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] italic text-muted-foreground sm:text-right">—</p>
                )}
              </div>
            </div>
          )}

        </div>


        {/* Download PDF */}
        {data.receipt_pdf_url && (
          <div className="px-6 pb-6">
            <a href={data.receipt_pdf_url} target="_blank" rel="noopener noreferrer">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download PDF Receipt
              </Button>
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 p-4 text-center text-xs text-gray-400 space-y-1">
          {data.rgi_number && <p>RGI: {data.rgi_number}</p>}
          {data.business_phone && <p>{data.business_phone}</p>}
          {data.business_address && <p>{data.business_address}</p>}
        </div>
      </div>
    </div>
  );
};

export default PublicReceipt;
