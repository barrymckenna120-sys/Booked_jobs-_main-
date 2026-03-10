-- ============================================================
-- COMPLETE DATABASE SCHEMA EXPORT
-- Project: BookedJobs / Plumb On Call
-- Generated: 2026-03-10
-- Schema only — no data included
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_role text NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  detail text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.customer_call_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  note text NOT NULL,
  created_by_name text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  address text NOT NULL,
  eircode text NOT NULL,
  area_code text,
  access_notes text,
  boiler_make_model text,
  boiler_type text,
  boiler_installation_date date,
  under_warranty boolean DEFAULT false,
  last_service_date date,
  last_service_engineer text,
  engineer_notes text,
  next_service_due date,
  service_status text DEFAULT 'Up to Date'::text,
  assigned_engineer text,
  notes text,
  customer_since date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  boiler_age integer,
  days_until_service integer,
  scheduled_service_date date,
  reminder_30_days_sent boolean DEFAULT false,
  reminder_7_days_sent boolean DEFAULT false,
  last_reminder_response text,
  opted_out boolean DEFAULT false,
  opted_out_date date,
  total_messages_sent integer DEFAULT 0,
  last_message_sent_at timestamp with time zone,
  last_message_type text,
  last_reminder_sent timestamp with time zone,
  renewal_stage text NOT NULL DEFAULT 'not_contacted'::text,
  is_archived boolean NOT NULL DEFAULT false
);

CREATE TABLE public.engineer_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  block_type text NOT NULL DEFAULT 'slot'::text,
  block_date date NOT NULL,
  end_date date,
  time_block text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.engineer_working_days (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_of_week smallint NOT NULL,
  is_working boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.engineers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  is_available boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'engineer'::text,
  status text NOT NULL DEFAULT 'active'::text,
  blocked_reason text,
  last_login text,
  auth_user_id uuid
);

CREATE TABLE public.job_media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid,
  customer_id uuid,
  user_id uuid,
  file_name text NOT NULL,
  file_type text,
  storage_path text NOT NULL,
  storage_bucket text DEFAULT 'job-media'::text,
  public_url text,
  uploaded_by text DEFAULT 'customer'::text,
  uploaded_at timestamp with time zone DEFAULT now(),
  notes text
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  job_id uuid,
  role text DEFAULT 'engineer'::text
);

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  sound_alerts_enabled boolean
);

CREATE TABLE public.quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  description text NOT NULL,
  parts_cost numeric DEFAULT 0,
  labour_cost numeric DEFAULT 0,
  callout_cost numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft'::text,
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  paid_at timestamp with time zone,
  payment_link text,
  deposit_amount numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.service_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  job_type text NOT NULL DEFAULT 'Boiler Service'::text,
  scheduled_date date,
  time_block text,
  assigned_engineer text,
  status text NOT NULL DEFAULT 'Scheduled'::text,
  deposit_required boolean NOT NULL DEFAULT false,
  deposit_amount numeric,
  deposit_paid boolean NOT NULL DEFAULT false,
  notes text,
  revenue numeric,
  has_quote boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  boiler_brand text,
  boiler_working boolean,
  boiler_issue text,
  source text DEFAULT 'Manual'::text,
  incoming_status text DEFAULT 'Pending'::text,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  tally_submission_id text,
  needs_scheduling boolean NOT NULL DEFAULT false,
  cancellation_reason text,
  cancellation_note text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  assigned_engineer_id uuid,
  payment_method text,
  paid_at timestamp with time zone,
  payment_collected_by uuid,
  receipt_number text,
  receipt_sent boolean NOT NULL DEFAULT false,
  receipt_sent_at timestamp with time zone
);

CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_name text NOT NULL DEFAULT 'Karl''s Gas'::text,
  whatsapp_number text,
  stripe_connected boolean NOT NULL DEFAULT false,
  default_callout_charge numeric DEFAULT 85,
  default_service_price numeric DEFAULT 120,
  reminder_message_template text DEFAULT 'Hi {customer_name}, your boiler service is due on {date}. Reply YES to confirm or call us on {phone}.'::text,
  logo_url text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  owner_name text,
  business_email text,
  business_phone text,
  website text,
  vat_number text,
  business_address text,
  invoice_prefix text DEFAULT 'K'::text,
  next_invoice_number integer DEFAULT 1,
  payment_terms text DEFAULT '30_days'::text,
  default_repair_price numeric DEFAULT 0,
  default_emergency_price numeric DEFAULT 150,
  google_review_url text,
  template_booking_confirmation text,
  template_renewal_reminder text,
  template_review_request text,
  template_quote_sent text,
  template_payment_link text,
  renewal_reminder_days_1 integer DEFAULT 30,
  renewal_reminder_days_2 integer DEFAULT 7,
  renewal_reminders_enabled boolean DEFAULT true,
  review_request_hours integer DEFAULT 2,
  review_requests_enabled boolean DEFAULT true,
  payment_reminder_days_1 integer DEFAULT 7,
  payment_reminder_days_2 integer DEFAULT 14,
  payment_reminders_enabled boolean DEFAULT true,
  opening_hours jsonb DEFAULT '[{"day": "Mon", "end": "17:00", "start": "08:00", "enabled": true}, {"day": "Tue", "end": "17:00", "start": "08:00", "enabled": true}, {"day": "Wed", "end": "17:00", "start": "08:00", "enabled": true}, {"day": "Thu", "end": "17:00", "start": "08:00", "enabled": true}, {"day": "Fri", "end": "17:00", "start": "08:00", "enabled": true}, {"day": "Sat", "end": "13:00", "start": "09:00", "enabled": true}, {"day": "Sun", "end": "13:00", "start": "09:00", "enabled": false}]'::jsonb,
  service_areas jsonb DEFAULT '["D15", "D6", "K67"]'::jsonb,
  job_time_blocks jsonb DEFAULT '[{"end": "11:00", "label": "Morning", "start": "09:00", "max_jobs": 2}, {"end": "14:00", "label": "Midday", "start": "11:00", "max_jobs": 2}, {"end": "17:00", "label": "Afternoon", "start": "14:00", "max_jobs": 2}]'::jsonb,
  receipts_counter integer NOT NULL DEFAULT 0
);

CREATE TABLE public.whatsapp_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  message_type text NOT NULL,
  message_body text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  sent_by text,
  customer_reply text,
  reply_received_at timestamp with time zone,
  status text DEFAULT 'Sent'::text,
  linked_quote_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.whatsapp_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  message_type text NOT NULL DEFAULT 'Custom'::text,
  body text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- PRIMARY KEYS
-- ============================================================

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_call_notes ADD CONSTRAINT customer_call_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.engineer_blocks ADD CONSTRAINT engineer_blocks_pkey PRIMARY KEY (id);
ALTER TABLE public.engineer_working_days ADD CONSTRAINT engineer_working_days_pkey PRIMARY KEY (id);
ALTER TABLE public.engineers ADD CONSTRAINT engineers_pkey PRIMARY KEY (id);
ALTER TABLE public.job_media ADD CONSTRAINT job_media_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.service_calls ADD CONSTRAINT service_calls_pkey PRIMARY KEY (id);
ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (id);
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

ALTER TABLE public.engineer_working_days ADD CONSTRAINT engineer_working_days_engineer_id_day_of_week_key UNIQUE (engineer_id, day_of_week);
ALTER TABLE public.engineers ADD CONSTRAINT engineers_auth_user_id_key UNIQUE (auth_user_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.settings ADD CONSTRAINT settings_user_id_key UNIQUE (user_id);

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

ALTER TABLE public.customer_call_notes ADD CONSTRAINT customer_call_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.engineer_blocks ADD CONSTRAINT engineer_blocks_engineer_id_fkey FOREIGN KEY (engineer_id) REFERENCES engineers(id) ON DELETE CASCADE;
ALTER TABLE public.engineer_working_days ADD CONSTRAINT engineer_working_days_engineer_id_fkey FOREIGN KEY (engineer_id) REFERENCES engineers(id) ON DELETE CASCADE;
ALTER TABLE public.job_media ADD CONSTRAINT job_media_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.job_media ADD CONSTRAINT job_media_job_id_fkey FOREIGN KEY (job_id) REFERENCES service_calls(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_job_id_fkey FOREIGN KEY (job_id) REFERENCES service_calls(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_job_id_fkey FOREIGN KEY (job_id) REFERENCES service_calls(id) ON DELETE CASCADE;
ALTER TABLE public.service_calls ADD CONSTRAINT service_calls_assigned_engineer_id_fkey FOREIGN KEY (assigned_engineer_id) REFERENCES engineers(id);
ALTER TABLE public.service_calls ADD CONSTRAINT service_calls_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_linked_quote_id_fkey FOREIGN KEY (linked_quote_id) REFERENCES quotes(id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX audit_log_action_type_idx ON public.audit_log USING btree (action_type);
CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);
CREATE INDEX audit_log_user_id_idx ON public.audit_log USING btree (user_id);
CREATE INDEX idx_job_media_job_id ON public.job_media USING btree (job_id);
CREATE INDEX idx_service_calls_date_engineer ON public.service_calls USING btree (scheduled_date, assigned_engineer);
CREATE INDEX idx_whatsapp_customer ON public.whatsapp_messages USING btree (customer_id, sent_at DESC);

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_engineer_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
  v_prefix text;
  v_receipt text;
BEGIN
  UPDATE public.settings
  SET receipts_counter = receipts_counter + 1
  WHERE user_id = p_user_id
  RETURNING receipts_counter, COALESCE(invoice_prefix, 'KG') INTO v_next, v_prefix;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Settings not found for user';
  END IF;

  v_receipt := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN v_receipt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_quote_public(p_quote_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'quote', json_build_object(
      'id', q.id,
      'description', q.description,
      'parts_cost', q.parts_cost,
      'labour_cost', q.labour_cost,
      'callout_cost', q.callout_cost,
      'total_amount', q.total_amount,
      'status', q.status,
      'payment_link', q.payment_link,
      'deposit_amount', q.deposit_amount,
      'created_at', q.created_at,
      'customer_id', q.customer_id,
      'job_id', q.job_id
    ),
    'customer_name', c.name,
    'customer_address', c.address,
    'business_name', COALESCE(s.business_name, 'BookedJobs'),
    'business_phone', s.business_phone,
    'whatsapp_number', s.whatsapp_number,
    'logo_url', s.logo_url
  )
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN settings s ON s.user_id = q.user_id
  WHERE q.id = p_quote_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_accepted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid;
  v_current_status text;
  v_customer_name text;
  v_user_id uuid;
  v_quote_ref text;
BEGIN
  SELECT q.status, q.job_id, q.user_id, c.name
  INTO v_current_status, v_job_id, v_user_id, v_customer_name
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.id = p_quote_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_current_status NOT IN ('Sent', 'Draft') THEN
    RAISE EXCEPTION 'Quote has already been responded to';
  END IF;

  v_quote_ref := 'Q-' || upper(left(p_quote_id::text, 4));

  IF p_accepted THEN
    UPDATE quotes SET status = 'Accepted', accepted_at = now(), updated_at = now() WHERE id = p_quote_id;
    UPDATE service_calls SET status = 'Awaiting Deposit', updated_at = now() WHERE id = v_job_id;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata)
    VALUES (
      v_user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_accepted',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_job_id, 'customer_name', v_customer_name)
    );
  ELSE
    UPDATE quotes SET status = 'Rejected', updated_at = now() WHERE id = p_quote_id;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata)
    VALUES (
      v_user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_declined',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' declined by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_job_id, 'customer_name', v_customer_name)
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  safe_display_name text;
BEGIN
  safe_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );
  safe_display_name := SUBSTRING(safe_display_name, 1, 100);

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, safe_display_name);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_job_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_name text;
  v_job_ref text;
  v_engineer_auth_id uuid;
  v_old_engineer_name text;
  v_new_engineer_name text;
  v_engineer_name text;
  v_payment_label text;
BEGIN
  v_job_ref := 'BJ-' || upper(left(NEW.id::text, 6));
  SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id LIMIT 1;
  v_customer_name := COALESCE(v_customer_name, 'Unknown');

  -- INSERT: new repair job notification for office
  IF TG_OP = 'INSERT' AND NEW.job_type IN ('Repair', 'Emergency') THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'new_repair', 'New Repair Job — ' || v_job_ref,
      v_customer_name || ' submitted a ' || lower(NEW.job_type) || ' request.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'job_type', NEW.job_type));
  END IF;

  -- INSERT: if engineer is already assigned at creation, notify engineer
  IF TG_OP = 'INSERT' AND NEW.assigned_engineer_id IS NOT NULL THEN
    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF v_engineer_auth_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
        v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
        NEW.id, 'engineer',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
    END IF;
  END IF;

  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Engineer assigned/reassigned
  IF NEW.assigned_engineer_id IS NOT NULL
     AND (OLD.assigned_engineer_id IS NULL OR OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id) THEN

    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF OLD.assigned_engineer_id IS NOT NULL AND OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id THEN
      SELECT name INTO v_old_engineer_name FROM public.engineers WHERE id = OLD.assigned_engineer_id LIMIT 1;

      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
          v_customer_name || ' reassigned from ' || COALESCE(v_old_engineer_name, 'another engineer') || '.',
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name));
      END IF;

      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (NEW.user_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
        v_customer_name || ' moved from ' || COALESCE(v_old_engineer_name, '—') || ' to ' || COALESCE(v_new_engineer_name, '—') || '.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name, 'new_engineer', v_new_engineer_name));
    ELSE
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
      END IF;
    END IF;
  END IF;

  -- En Route
  IF NEW.status = 'En Route' AND OLD.status IS DISTINCT FROM 'En Route' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'en_route', 'En Route — ' || v_job_ref,
      COALESCE(v_engineer_name, 'Engineer') || ' is en route to ' || v_customer_name || '.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name));
  END IF;

  -- On Site
  IF NEW.status = 'On Site' AND OLD.status IS DISTINCT FROM 'On Site' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'on_site', 'On Site — ' || v_job_ref,
      COALESCE(v_engineer_name, 'Engineer') || ' has arrived at ' || v_customer_name || '.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name));
  END IF;

  -- In Progress
  IF NEW.status = 'In Progress' AND OLD.status IS DISTINCT FROM 'In Progress' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'in_progress', 'Work Started — ' || v_job_ref,
      COALESCE(v_engineer_name, 'Engineer') || ' has started work at ' || v_customer_name || '.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name));
  END IF;

  -- Cancelled
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    IF NEW.assigned_engineer_id IS NOT NULL THEN
      SELECT auth_user_id INTO v_engineer_auth_id FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason));
      END IF;
    END IF;
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
      v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason));
  END IF;

  -- No show
  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'no_show', 'No Show — ' || v_job_ref,
      v_customer_name || ' · Could not gain access.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
  END IF;

  -- Parts needed
  IF NEW.status = 'parts_needed' AND OLD.status IS DISTINCT FROM 'parts_needed' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'parts_needed', 'Parts Needed — ' || v_job_ref,
      v_customer_name || ' · Engineer requires parts to continue.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'notes', NEW.notes));
  END IF;

  -- Completed
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    IF NEW.payment_method IS NOT NULL THEN
      v_payment_label := CASE NEW.payment_method
        WHEN 'cash' THEN 'Cash'
        WHEN 'card' THEN 'Card'
        WHEN 'invoice' THEN 'Invoice Required'
        ELSE initcap(NEW.payment_method)
      END;

      SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (NEW.user_id, 'payment_collected', 'Payment — ' || v_job_ref,
        v_customer_name || ' · ' || v_payment_label || ' · ' || COALESCE(v_engineer_name, 'Engineer'),
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'payment_method', NEW.payment_method, 'engineer_name', v_engineer_name));
    END IF;

    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'completed', 'Job Completed — ' || v_job_ref,
      v_customer_name || ' completed successfully.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_engineers_updated_at BEFORE UPDATE ON public.engineers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_calls_updated_at BEFORE UPDATE ON public.service_calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_notify_on_job_change AFTER INSERT OR UPDATE ON public.service_calls FOR EACH ROW EXECUTE FUNCTION notify_on_job_change();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_call_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineer_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineer_working_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- audit_log
CREATE POLICY "admin_read_audit" ON public.audit_log AS RESTRICTIVE FOR SELECT TO authenticated USING ((get_user_role(auth.uid()) = 'admin'::text));
CREATE POLICY "audit_log_no_delete" ON public.audit_log AS RESTRICTIVE FOR DELETE TO public USING (false);
CREATE POLICY "audit_log_no_update" ON public.audit_log AS RESTRICTIVE FOR UPDATE TO public USING (false);
CREATE POLICY "auth_insert_audit" ON public.audit_log AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

-- customer_call_notes
CREATE POLICY "engineer_insert_notes" ON public.customer_call_notes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((get_user_role(auth.uid()) = 'engineer'::text) AND (customer_id IN (
    SELECT service_calls.customer_id FROM service_calls WHERE (service_calls.assigned_engineer_id = get_engineer_id(auth.uid()))))));
CREATE POLICY "engineer_read_notes" ON public.customer_call_notes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((get_user_role(auth.uid()) = 'engineer'::text) AND (customer_id IN (
    SELECT service_calls.customer_id FROM service_calls WHERE (service_calls.assigned_engineer_id = get_engineer_id(auth.uid()))))));
CREATE POLICY "office_full_access" ON public.customer_call_notes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])))
  WITH CHECK ((get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])));

-- customers
CREATE POLICY "Users can create customers" ON public.customers AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own customers" ON public.customers AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own customers" ON public.customers AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "customers_select" ON public.customers AS RESTRICTIVE FOR SELECT TO public
  USING (CASE get_user_role(auth.uid())
    WHEN 'engineer'::text THEN (id IN (SELECT service_calls.customer_id FROM service_calls WHERE (service_calls.assigned_engineer_id = get_engineer_id(auth.uid()))))
    ELSE (auth.uid() = user_id)
  END);

-- engineer_blocks
CREATE POLICY "Users can delete own engineer blocks" ON public.engineer_blocks AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own engineer blocks" ON public.engineer_blocks AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own engineer blocks" ON public.engineer_blocks AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own engineer blocks" ON public.engineer_blocks AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- engineer_working_days
CREATE POLICY "Users can delete own engineer working days" ON public.engineer_working_days AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own engineer working days" ON public.engineer_working_days AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own engineer working days" ON public.engineer_working_days AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own engineer working days" ON public.engineer_working_days AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- engineers
CREATE POLICY "Users can delete their own engineers" ON public.engineers AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own engineers" ON public.engineers AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own engineers" ON public.engineers AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own engineers" ON public.engineers AS RESTRICTIVE FOR SELECT TO public USING (((auth.uid() = user_id) OR (auth.uid() = auth_user_id)));

-- job_media
CREATE POLICY "job_media_delete_own" ON public.job_media AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((auth.uid() = user_id) OR (auth.uid() IN (SELECT sc.user_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))));
CREATE POLICY "job_media_insert_own" ON public.job_media AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) OR (auth.uid() IN (SELECT sc.user_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))
    OR (get_engineer_id(auth.uid()) IN (SELECT sc.assigned_engineer_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))));
CREATE POLICY "job_media_select_own" ON public.job_media AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((auth.uid() = user_id) OR (auth.uid() IN (SELECT sc.user_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))
    OR (get_engineer_id(auth.uid()) IN (SELECT sc.assigned_engineer_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))));
CREATE POLICY "job_media_update_own" ON public.job_media AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((auth.uid() = user_id) OR (auth.uid() IN (SELECT sc.user_id FROM service_calls sc WHERE (sc.id = job_media.job_id)))));

-- notifications
CREATE POLICY "notifications_delete" ON public.notifications AS RESTRICTIVE FOR DELETE TO authenticated USING ((auth.uid() = recipient_user_id));
CREATE POLICY "notifications_insert" ON public.notifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])));
CREATE POLICY "notifications_select" ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated USING ((auth.uid() = recipient_user_id));
CREATE POLICY "notifications_update" ON public.notifications AS RESTRICTIVE FOR UPDATE TO authenticated USING ((auth.uid() = recipient_user_id));

-- profiles
CREATE POLICY "Users can insert their own profile" ON public.profiles AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own profile" ON public.profiles AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own profile" ON public.profiles AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- quotes
CREATE POLICY "Users can delete their own quotes" ON public.quotes AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own quotes" ON public.quotes AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own quotes" ON public.quotes AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own quotes" ON public.quotes AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- service_calls
CREATE POLICY "service_calls_delete" ON public.service_calls AS RESTRICTIVE FOR DELETE TO public
  USING (((get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])) AND (auth.uid() = user_id)));
CREATE POLICY "service_calls_insert" ON public.service_calls AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (((get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])) AND (auth.uid() = user_id)));
CREATE POLICY "service_calls_select" ON public.service_calls AS RESTRICTIVE FOR SELECT TO public
  USING (CASE get_user_role(auth.uid())
    WHEN 'engineer'::text THEN (assigned_engineer_id = get_engineer_id(auth.uid()))
    ELSE (auth.uid() = user_id)
  END);
CREATE POLICY "service_calls_update" ON public.service_calls AS RESTRICTIVE FOR UPDATE TO public
  USING (CASE get_user_role(auth.uid())
    WHEN 'engineer'::text THEN (assigned_engineer_id = get_engineer_id(auth.uid()))
    ELSE (auth.uid() = user_id)
  END);

-- settings
CREATE POLICY "Users can insert their own settings" ON public.settings AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own settings" ON public.settings AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own settings" ON public.settings AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- whatsapp_messages
CREATE POLICY "Users can delete their own messages" ON public.whatsapp_messages AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own messages" ON public.whatsapp_messages AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own messages" ON public.whatsapp_messages AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own messages" ON public.whatsapp_messages AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- whatsapp_templates
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates AS RESTRICTIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own templates" ON public.whatsapp_templates AS RESTRICTIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates AS RESTRICTIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- ============================================================
-- STORAGE BUCKETS (for reference)
-- ============================================================
-- Bucket: job-media (public)
-- Bucket: business-logos (public)
