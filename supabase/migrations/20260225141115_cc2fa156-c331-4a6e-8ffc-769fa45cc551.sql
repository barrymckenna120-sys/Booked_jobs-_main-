
-- Engineers table
CREATE TABLE public.engineers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  is_available boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.engineers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own engineers" ON public.engineers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own engineers" ON public.engineers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own engineers" ON public.engineers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own engineers" ON public.engineers FOR DELETE USING (auth.uid() = user_id);

-- Service calls table
CREATE TABLE public.service_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'Boiler Service',
  scheduled_date date,
  time_block text,
  assigned_engineer text,
  status text NOT NULL DEFAULT 'Scheduled',
  deposit_required boolean NOT NULL DEFAULT false,
  deposit_amount numeric,
  deposit_paid boolean NOT NULL DEFAULT false,
  notes text,
  revenue numeric,
  has_quote boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.service_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own service_calls" ON public.service_calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own service_calls" ON public.service_calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own service_calls" ON public.service_calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own service_calls" ON public.service_calls FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_service_calls_date_engineer ON public.service_calls (scheduled_date, assigned_engineer);

-- Quotes table
CREATE TABLE public.quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  description text NOT NULL,
  parts_cost numeric DEFAULT 0,
  labour_cost numeric DEFAULT 0,
  callout_cost numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft',
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  paid_at timestamp with time zone,
  payment_link text,
  deposit_amount numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quotes" ON public.quotes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own quotes" ON public.quotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own quotes" ON public.quotes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own quotes" ON public.quotes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public can view quotes by id" ON public.quotes FOR SELECT USING (true);

-- Settings table (single row per user)
CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL DEFAULT 'Karl''s Gas',
  whatsapp_number text,
  stripe_connected boolean NOT NULL DEFAULT false,
  default_callout_charge numeric DEFAULT 85,
  default_service_price numeric DEFAULT 120,
  reminder_message_template text DEFAULT 'Hi {customer_name}, your boiler service is due on {date}. Reply YES to confirm or call us on {phone}.',
  logo_url text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings" ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.settings FOR UPDATE USING (auth.uid() = user_id);

-- Add missing columns to customers if not present
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS boiler_age integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS days_until_service integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS scheduled_service_date date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_30_days_sent boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_7_days_sent boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_reminder_response text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opted_out boolean DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opted_out_date date;

-- Updated_at triggers for new tables
CREATE TRIGGER update_engineers_updated_at BEFORE UPDATE ON public.engineers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_calls_updated_at BEFORE UPDATE ON public.service_calls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for quotes (for live acceptance notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
