-- Migration 0011: WhatsApp webhook message-id dedup (issue #245)
--
-- Meta redelivers webhook events on infra hiccups. Without a dedup, a
-- redelivered "SÍ" confirmation would pass the pending-session read twice and
-- save the invoice twice. The bot claims each message id here before
-- processing (INSERT … ON CONFLICT DO NOTHING RETURNING); an empty return
-- means it was already handled.

CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
	message_id  text PRIMARY KEY,
	received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_received
	ON whatsapp_processed_messages (received_at);

-- Written only by the server (direct owner connection); not exposed via the
-- Data API, so RLS is enabled with no user-facing policies.
ALTER TABLE whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
