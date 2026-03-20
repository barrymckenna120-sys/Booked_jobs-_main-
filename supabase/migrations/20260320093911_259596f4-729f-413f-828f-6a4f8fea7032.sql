
-- Quote number sequence
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  next_val INT;
  year_str TEXT;
BEGIN
  next_val := nextval('quote_number_seq');
  year_str := TO_CHAR(NOW(), 'YYYY');
  RETURN 'Q-' || year_str || '-' || LPAD(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS quote_number TEXT UNIQUE DEFAULT generate_quote_number(),
  ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS deposit NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS default_terms TEXT,
  ADD COLUMN IF NOT EXISTS default_expiry_days INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_vat_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_deposit NUMERIC(10,2) DEFAULT 0.00;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage products"
ON products FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage quote line items"
ON quote_line_items FOR ALL USING (auth.role() = 'authenticated');
