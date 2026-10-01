REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fault_finder_settings FROM authenticated;
REVOKE ALL ON public.fault_finder_settings FROM anon;
REVOKE ALL ON public.fault_finder_settings FROM public;