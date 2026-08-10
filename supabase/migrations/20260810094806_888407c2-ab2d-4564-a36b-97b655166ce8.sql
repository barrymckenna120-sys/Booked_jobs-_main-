UPDATE public.service_calls
SET revenue = 25.00,
    balance_due = 25.00,
    deposit_required = false,
    deposit_amount = NULL,
    payment_status = 'unpaid',
    paid_at = NULL,
    sumup_checkout_id = NULL,
    payment_link = NULL
WHERE id = 'ef64538d-1a3e-4775-ac04-263b87c7eb6b';