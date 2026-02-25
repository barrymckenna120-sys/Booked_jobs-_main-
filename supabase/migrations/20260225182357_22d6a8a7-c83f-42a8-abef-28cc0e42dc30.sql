
-- Create whatsapp_messages table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  message_type    TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  sent_by         TEXT,
  customer_reply  TEXT,
  reply_received_at TIMESTAMPTZ,
  status          TEXT DEFAULT 'Sent',
  linked_quote_id UUID REFERENCES quotes(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast customer message history lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_customer
  ON whatsapp_messages (customer_id, sent_at DESC);

-- RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
  ON whatsapp_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON whatsapp_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON whatsapp_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

-- Add tracking columns to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_messages_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_type TEXT;
