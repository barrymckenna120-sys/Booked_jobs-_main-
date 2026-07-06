-- Ensure pgcrypto is available for HMAC. Supabase ships it in the extensions schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Bootstrap / rotate the HMAC secret in Supabase Vault.
--    Service-role only (called from the impersonate-org edge function on startup).
CREATE OR REPLACE FUNCTION public.bootstrap_impersonation_hmac(_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'bootstrap_impersonation_hmac may only be called by the service role';
  END IF;

  IF _secret IS NULL OR length(_secret) < 32 THEN
    RAISE EXCEPTION 'Secret must be at least 32 characters';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'impersonation_hmac_secret' LIMIT 1;

  IF v_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      v_id,
      _secret,
      'impersonation_hmac_secret',
      'HMAC key for signing superadmin org impersonation tokens'
    );
  ELSE
    PERFORM vault.create_secret(
      _secret,
      'impersonation_hmac_secret',
      'HMAC key for signing superadmin org impersonation tokens'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_impersonation_hmac(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_impersonation_hmac(text) TO service_role;

-- 2) Verify a signed impersonation token.
--    Token format:  base64url(payload_json) . base64url(hmac_sha256(payload_b64, secret))
--    Returns the payload jsonb (with keys uid, org_id, exp) if signature and expiry check out,
--    otherwise NULL. The caller (get_my_org_id) is responsible for also checking uid matches
--    auth.uid() and that the user is a superadmin.
CREATE OR REPLACE FUNCTION public.verify_impersonation_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_payload_b64 text;
  v_sig_b64 text;
  v_secret text;
  v_expected_sig text;
  v_payload_bytes bytea;
  v_payload jsonb;
  v_exp bigint;
BEGIN
  IF _token IS NULL OR position('.' IN _token) = 0 THEN RETURN NULL; END IF;

  v_parts := string_to_array(_token, '.');
  IF array_length(v_parts, 1) <> 2 THEN RETURN NULL; END IF;

  v_payload_b64 := v_parts[1];
  v_sig_b64 := regexp_replace(v_parts[2], '\s+', '', 'g');

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'impersonation_hmac_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN RETURN NULL; END IF;

  -- Recompute HMAC-SHA256 over the raw base64url payload string bytes.
  -- Strip padding '=' and swap +/ -> -_ to match base64url on the edge side.
  v_expected_sig := regexp_replace(
    translate(
      encode(
        extensions.hmac(convert_to(v_payload_b64, 'utf8'), convert_to(v_secret, 'utf8'), 'sha256'),
        'base64'
      ),
      '+/=', '-_'
    ),
    '\s+', '', 'g'
  );

  IF v_expected_sig <> v_sig_b64 THEN RETURN NULL; END IF;

  -- Decode payload (add base64 padding back before decoding)
  BEGIN
    v_payload_bytes := decode(
      translate(v_payload_b64, '-_', '+/')
      || repeat('=', (4 - (length(v_payload_b64) % 4)) % 4),
      'base64'
    );
    v_payload := convert_from(v_payload_bytes, 'utf8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  v_exp := NULLIF(v_payload->>'exp', '')::bigint;
  IF v_exp IS NULL OR v_exp < extract(epoch FROM now())::bigint THEN
    RETURN NULL;
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_impersonation_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_impersonation_token(text) TO authenticated, anon, service_role;

-- 3) Updated get_my_org_id():
--    Preference order:
--      (a) signed x-org-impersonation-token header (superadmin-verified, uid-bound, exp-checked)
--      (b) LEGACY raw x-org-id header (superadmin-only) — to be removed in Turn 2
--      (c) JWT app_metadata.organisation_id
--      (d) profiles.organisation_id
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  v_token text;
  v_payload jsonb;
  v_header_org uuid;
  v_is_superadmin boolean;
BEGIN
  -- (a) Signed impersonation token
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-org-impersonation-token';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NOT NULL THEN
    v_payload := public.verify_impersonation_token(v_token);
    IF v_payload IS NOT NULL
       AND NULLIF(v_payload->>'uid', '')::uuid = auth.uid()
    THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND role = 'superadmin'
      ) INTO v_is_superadmin;

      IF v_is_superadmin THEN
        RETURN NULLIF(v_payload->>'org_id', '')::uuid;
      END IF;
    END IF;
  END IF;

  -- (b) LEGACY fallback: raw x-org-id header. Removed in Turn 2.
  BEGIN
    v_header_org := (current_setting('request.headers', true)::json->>'x-org-id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_header_org := NULL;
  END;

  IF v_header_org IS NOT NULL THEN
    IF v_is_superadmin IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND role = 'superadmin'
      ) INTO v_is_superadmin;
    END IF;
    IF v_is_superadmin THEN
      RETURN v_header_org;
    END IF;
  END IF;

  -- (c) JWT app_metadata
  org_id := (auth.jwt()->'app_metadata'->>'organisation_id')::uuid;

  -- (d) profiles fallback
  IF org_id IS NULL THEN
    SELECT organisation_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN org_id;
END;
$$;