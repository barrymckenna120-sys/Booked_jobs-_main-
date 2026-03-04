
-- Add sound_alerts_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sound_alerts_enabled boolean DEFAULT null;

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own notifications
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = recipient_user_id);

CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_user_id);

CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = recipient_user_id);

-- Allow inserts from authenticated users (admin/office creating notifications for engineers)
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
