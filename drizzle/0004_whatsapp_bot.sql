-- WhatsApp bot: authorized contacts and pending session state

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id            SERIAL PRIMARY KEY,
  restaurant_id UUID    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- E.164 without leading '+', e.g. "34612345678"
  phone_number  TEXT    NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contacts_phone_unique
  ON whatsapp_contacts (phone_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_restaurant
  ON whatsapp_contacts (restaurant_id);

CREATE TABLE IF NOT EXISTS whatsapp_bot_sessions (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- Sender's WhatsApp number in E.164 without '+'
  from_number    TEXT    NOT NULL,
  -- Full extracted invoice data (JSON)
  extracted_data JSONB,
  -- Storage key for the uploaded file
  file_key       TEXT,
  -- awaiting_confirmation | confirmed | discarded
  status         TEXT    NOT NULL DEFAULT 'awaiting_confirmation',
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  -- Sessions expire after 1 hour; bot rejects confirmations past this point
  expires_at     TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_from_status
  ON whatsapp_bot_sessions (from_number, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires
  ON whatsapp_bot_sessions (expires_at);
