
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('Draft', 'Sent', 'sent', 'Accepted', 'Rejected', 'Paid', 'Pending Approval', 'viewed', 'expired', 'converted'));
