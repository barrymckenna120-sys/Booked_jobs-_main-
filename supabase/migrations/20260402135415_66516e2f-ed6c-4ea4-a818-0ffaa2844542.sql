
CREATE OR REPLACE FUNCTION public.update_customer_last_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_completed date;
  v_date_str text;
  v_note_entry text;
  v_tags text;
  v_existing_notes text;
BEGIN
  IF NEW.status = 'Completed' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'Completed') THEN

    v_completed := COALESCE(NEW.completed_at::date, CURRENT_DATE);
    v_date_str := to_char(v_completed, 'DD/MM/YYYY');

    -- Build the note entry
    v_note_entry := '';

    IF NEW.notes IS NOT NULL AND TRIM(NEW.notes) <> '' THEN
      v_note_entry := v_date_str || ' - Work done: ' || TRIM(NEW.notes);
    END IF;

    -- Collect tags for this service call
    SELECT string_agg(jt.name, ', ')
    INTO v_tags
    FROM public.service_call_tags sct
    JOIN public.job_tags jt ON jt.id = sct.tag_id
    WHERE sct.service_call_id = NEW.id;

    IF v_tags IS NOT NULL AND v_tags <> '' THEN
      IF v_note_entry = '' THEN
        v_note_entry := v_date_str || ' - Tags: ' || v_tags;
      ELSE
        v_note_entry := v_note_entry || '. Tags: ' || v_tags;
      END IF;
    END IF;

    -- Get existing customer notes
    SELECT notes INTO v_existing_notes FROM public.customers WHERE id = NEW.customer_id;

    -- Append if we have something to add
    IF v_note_entry <> '' THEN
      IF v_existing_notes IS NOT NULL AND TRIM(v_existing_notes) <> '' THEN
        v_existing_notes := v_existing_notes || E'\n' || v_note_entry;
      ELSE
        v_existing_notes := v_note_entry;
      END IF;
    END IF;

    UPDATE public.customers
    SET last_service_date = v_completed,
        last_service_engineer = NEW.assigned_engineer,
        notes = COALESCE(v_existing_notes, notes)
    WHERE id = NEW.customer_id;

  END IF;
  RETURN NEW;
END;
$function$;
