
-- ============================================================
-- CUSTOMERS: 4 policies (INSERT, DELETE, UPDATE, SELECT)
-- ============================================================
DROP POLICY IF EXISTS "Users can create customers" ON public.customers;
CREATE POLICY "Users can create customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;
CREATE POLICY "Users can delete their own customers" ON public.customers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
CREATE POLICY "Users can update their own customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customers_select" ON public.customers;
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (
    CASE get_user_role(auth.uid())
      WHEN 'engineer' THEN (id IN (SELECT customer_id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid())))
      ELSE (auth.uid() = user_id)
    END
  );

-- ============================================================
-- ENGINEER_BLOCKS: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own engineer blocks" ON public.engineer_blocks;
CREATE POLICY "Users can delete own engineer blocks" ON public.engineer_blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own engineer blocks" ON public.engineer_blocks;
CREATE POLICY "Users can insert own engineer blocks" ON public.engineer_blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own engineer blocks" ON public.engineer_blocks;
CREATE POLICY "Users can update own engineer blocks" ON public.engineer_blocks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own engineer blocks" ON public.engineer_blocks;
CREATE POLICY "Users can view own engineer blocks" ON public.engineer_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- ENGINEER_WORKING_DAYS: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own engineer working days" ON public.engineer_working_days;
CREATE POLICY "Users can delete own engineer working days" ON public.engineer_working_days
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own engineer working days" ON public.engineer_working_days;
CREATE POLICY "Users can insert own engineer working days" ON public.engineer_working_days
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own engineer working days" ON public.engineer_working_days;
CREATE POLICY "Users can update own engineer working days" ON public.engineer_working_days
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own engineer working days" ON public.engineer_working_days;
CREATE POLICY "Users can view own engineer working days" ON public.engineer_working_days
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- ENGINEERS: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete their own engineers" ON public.engineers;
CREATE POLICY "Users can delete their own engineers" ON public.engineers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own engineers" ON public.engineers;
CREATE POLICY "Users can insert their own engineers" ON public.engineers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own engineers" ON public.engineers;
CREATE POLICY "Users can update their own engineers" ON public.engineers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own engineers" ON public.engineers;
CREATE POLICY "Users can view their own engineers" ON public.engineers
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR (auth.uid() = auth_user_id));

-- ============================================================
-- PROFILES: 3 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- QUOTES: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete their own quotes" ON public.quotes;
CREATE POLICY "Users can delete their own quotes" ON public.quotes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own quotes" ON public.quotes;
CREATE POLICY "Users can insert their own quotes" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quotes" ON public.quotes;
CREATE POLICY "Users can update their own quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own quotes" ON public.quotes;
CREATE POLICY "Users can view their own quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- SERVICE_CALLS: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "service_calls_delete" ON public.service_calls;
CREATE POLICY "service_calls_delete" ON public.service_calls
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = ANY (ARRAY['admin','office'])) AND (auth.uid() = user_id));

DROP POLICY IF EXISTS "service_calls_insert" ON public.service_calls;
CREATE POLICY "service_calls_insert" ON public.service_calls
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = ANY (ARRAY['admin','office'])) AND (auth.uid() = user_id));

DROP POLICY IF EXISTS "service_calls_select" ON public.service_calls;
CREATE POLICY "service_calls_select" ON public.service_calls
  FOR SELECT TO authenticated
  USING (
    CASE get_user_role(auth.uid())
      WHEN 'engineer' THEN (assigned_engineer_id = get_engineer_id(auth.uid()))
      ELSE (auth.uid() = user_id)
    END
  );

DROP POLICY IF EXISTS "service_calls_update" ON public.service_calls;
CREATE POLICY "service_calls_update" ON public.service_calls
  FOR UPDATE TO authenticated
  USING (
    CASE get_user_role(auth.uid())
      WHEN 'engineer' THEN (assigned_engineer_id = get_engineer_id(auth.uid()))
      ELSE (auth.uid() = user_id)
    END
  );

-- ============================================================
-- SETTINGS: 3 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.settings;
CREATE POLICY "Users can insert their own settings" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.settings;
CREATE POLICY "Users can update their own settings" ON public.settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own settings" ON public.settings;
CREATE POLICY "Users can view their own settings" ON public.settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- WHATSAPP_MESSAGES: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.whatsapp_messages;
CREATE POLICY "Users can delete their own messages" ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own messages" ON public.whatsapp_messages;
CREATE POLICY "Users can insert their own messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own messages" ON public.whatsapp_messages;
CREATE POLICY "Users can update their own messages" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own messages" ON public.whatsapp_messages;
CREATE POLICY "Users can view their own messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- WHATSAPP_TEMPLATES: 4 policies
-- ============================================================
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can update their own templates" ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- QUICK_REPLIES: 4 public-role policies (keep the authenticated one)
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own quick replies" ON public.quick_replies;
CREATE POLICY "Users can delete own quick replies" ON public.quick_replies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own quick replies" ON public.quick_replies;
CREATE POLICY "Users can insert own quick replies" ON public.quick_replies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own quick replies" ON public.quick_replies;
CREATE POLICY "Users can update own quick replies" ON public.quick_replies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own quick replies" ON public.quick_replies;
CREATE POLICY "Users can view own quick replies" ON public.quick_replies
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- AUDIT_LOG: 2 public-role policies (keep authenticated ones)
-- ============================================================
DROP POLICY IF EXISTS "audit_log_no_delete" ON public.audit_log;
CREATE POLICY "audit_log_no_delete" ON public.audit_log
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "audit_log_no_update" ON public.audit_log;
CREATE POLICY "audit_log_no_update" ON public.audit_log
  FOR UPDATE TO authenticated
  USING (false);
