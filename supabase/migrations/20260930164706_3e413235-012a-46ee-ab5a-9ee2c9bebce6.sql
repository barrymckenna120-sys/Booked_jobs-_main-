CREATE OR REPLACE FUNCTION public.protect_whatsapp_test_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.whatsapp_test_mode IS DISTINCT FROM OLD.whatsapp_test_mode
     AND current_user IN ('anon','authenticated')
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a superadmin can change WhatsApp test mode' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_whatsapp_test_mode() FROM PUBLIC, anon, authenticated;