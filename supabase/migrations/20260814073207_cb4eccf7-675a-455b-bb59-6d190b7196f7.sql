UPDATE notifications
SET role = 'office'
WHERE notification_type = 'payment_collected'
  AND role = 'engineer'
  AND metadata->>'source' = 'sumup';