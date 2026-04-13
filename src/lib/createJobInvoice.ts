import { supabase } from "@/integrations/supabase/client";

type CreateJobInvoiceResult = {
  invoice_number?: string | null;
} | null;

export const createJobInvoice = async (jobId: string): Promise<CreateJobInvoiceResult> => {
  const { data, error } = await supabase.functions.invoke("create-job-invoice", {
    body: { job_id: jobId },
  });

  if (error) {
    throw error;
  }

  return (data ?? null) as CreateJobInvoiceResult;
};
