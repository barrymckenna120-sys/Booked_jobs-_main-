
UPDATE service_calls sc
SET 
  deposit_amount = COALESCE(NULLIF(q.deposit_amount, 0), q.deposit, 0),
  balance_due = COALESCE(q.balance_due, sc.balance_due),
  deposit_required = true,
  revenue = COALESCE(sc.revenue, q.total_amount)
FROM quotes q
WHERE q.converted_job_id = sc.id
  AND (sc.deposit_amount IS NULL OR sc.deposit_amount = 0)
  AND (COALESCE(q.deposit_amount, 0) > 0 OR COALESCE(q.deposit, 0) > 0);
