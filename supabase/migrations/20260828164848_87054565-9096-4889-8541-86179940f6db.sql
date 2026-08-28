CREATE VIEW public.payment_reconciliation_exceptions
WITH (security_invoker = true)
AS
SELECT
  sc.id              AS service_call_id,
  sc.job_reference,
  sc.organisation_id,
  sc.revenue,
  sc.balance_due,
  sc.payment_status,
  sc.payment_method,
  sc.receipt_sent,
  sc.paid_at,
  led.ledger_total,
  led.payment_count
FROM public.service_calls sc
JOIN (
  SELECT
    p.service_call_id,
    round(sum(p.amount)::numeric, 2) AS ledger_total,
    count(*)                         AS payment_count
  FROM public.job_payments p
  WHERE p.amount > 0
  GROUP BY p.service_call_id
) led ON led.service_call_id = sc.id
WHERE sc.organisation_id = public.get_my_org_id()
  AND coalesce(sc.payment_method, '') <> 'invoice'
  AND (
    -- Fully covered by the ledger, yet not marked paid.
    (
      coalesce(sc.revenue, 0) > 0
      AND led.ledger_total >= coalesce(sc.revenue, 0)
      AND coalesce(sc.payment_status, '') <> 'paid'
    )
    OR
    -- Stale balance_due: what the job claims was collected disagrees with the ledger.
    (
      coalesce(sc.revenue, 0) > 0
      AND sc.balance_due IS NOT NULL
      AND abs((coalesce(sc.revenue, 0) - sc.balance_due) - led.ledger_total) > 0.01
    )
  );

GRANT SELECT ON public.payment_reconciliation_exceptions TO authenticated;
GRANT SELECT ON public.payment_reconciliation_exceptions TO service_role;