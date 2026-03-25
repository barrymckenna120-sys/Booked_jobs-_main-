ALTER TABLE service_calls 
ADD COLUMN sumup_checkout_id text,
ADD COLUMN payment_link text,
ADD COLUMN payment_status text DEFAULT 'unpaid';