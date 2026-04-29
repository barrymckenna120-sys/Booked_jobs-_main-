UPDATE service_calls 
SET deposit_paid = true, 
    payment_status = 'deposit_paid',
    balance_due = 153.13
WHERE job_reference = 'KN-261';