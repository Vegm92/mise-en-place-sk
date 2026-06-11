-- Drop the dead durable extraction flow (pending_* tables) now that
-- pg-boss + upload_sessions is the single extraction pipeline.
-- All rows in these tables were never written to by the live app
-- (the flow was stubbed out and the async worker was never deployed).

DROP TABLE IF EXISTS pending_line_items;
DROP TABLE IF EXISTS pending_processed_invoices;
