CREATE UNIQUE INDEX IF NOT EXISTS organisations_public_domain_unique
  ON public.organisations (lower(public_domain))
  WHERE public_domain IS NOT NULL;