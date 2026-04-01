
-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL DEFAULT '8c37827f-ce2c-4507-a821-a5e807d89856'::uuid REFERENCES public.organisations(id),
  job_id uuid REFERENCES public.service_calls(id),
  quote_id uuid REFERENCES public.quotes(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  user_id uuid NOT NULL,
  invoice_number text DEFAULT generate_invoice_number(),
  total_amount numeric NOT NULL DEFAULT 0,
  deposit_paid numeric DEFAULT 0,
  balance_due numeric DEFAULT 0,
  vat_enabled boolean DEFAULT false,
  status text NOT NULL DEFAULT 'unpaid',
  pdf_url text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoice line items table
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices (matching quotes pattern)
CREATE POLICY "Users can view their own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- RLS policies for invoice_line_items (matching quote_line_items pattern)
CREATE POLICY "Authenticated users can manage invoice line items"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
