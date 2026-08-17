UPDATE public.settings
SET message_footer = ''
WHERE organisation_id = '62d6c1c3-99cc-47fa-80ce-ea0e36f0d52b';

UPDATE public.tenant_integrations
SET config = config || '{"company_phone": ""}'::jsonb
WHERE organisation_id = '62d6c1c3-99cc-47fa-80ce-ea0e36f0d52b'
  AND integration_type = '360messenger';