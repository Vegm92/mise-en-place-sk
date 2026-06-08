-- Enable RLS and create policies for all public tables.
-- Access model: users access data through the restaurants they belong to
-- (user_restaurants pivot). All business tables are scoped by restaurant_id.
-- user_id is stored as text; cast auth.uid() to text for comparisons.

-- ── Helper: reusable sub-select ───────────────────────────────────────────────
-- Every restaurant-scoped policy uses:
--   restaurant_id IN (SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text)

-- ── 1. user_restaurants ───────────────────────────────────────────────────────
ALTER TABLE user_restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_associations" ON user_restaurants
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ── 2. restaurants ────────────────────────────────────────────────────────────
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_access_their_restaurants" ON restaurants
  FOR SELECT
  USING (
    id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "users_update_their_restaurants" ON restaurants
  FOR UPDATE
  USING (
    id IN (
      SELECT restaurant_id FROM user_restaurants
      WHERE user_id = auth.uid()::text AND role = 'owner'
    )
  );

-- INSERT is handled server-side only (service role); no anon/user INSERT policy.
-- DELETE likewise — only service role or an explicit admin policy.

-- ── 3. suppliers ──────────────────────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_suppliers" ON suppliers
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 4. invoices ───────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_invoices" ON invoices
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 5. invoice_line_items ────────────────────────────────────────────────────
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_invoice_line_items" ON invoice_line_items
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 6. supplier_metrics ───────────────────────────────────────────────────────
ALTER TABLE supplier_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_supplier_metrics" ON supplier_metrics
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 7. settings ───────────────────────────────────────────────────────────────
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_settings" ON settings
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 8. category_budgets ───────────────────────────────────────────────────────
ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_category_budgets" ON category_budgets
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 9. unit_conversions ───────────────────────────────────────────────────────
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_unit_conversions" ON unit_conversions
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 10. system_notifications ─────────────────────────────────────────────────
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_system_notifications" ON system_notifications
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 11. stock_levels ─────────────────────────────────────────────────────────
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_stock_levels" ON stock_levels
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 12. extraction_corrections ───────────────────────────────────────────────
ALTER TABLE extraction_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_extraction_corrections" ON extraction_corrections
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 13. pending_processed_invoices ───────────────────────────────────────────
ALTER TABLE pending_processed_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_pending_processed_invoices" ON pending_processed_invoices
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 14. pending_line_items ───────────────────────────────────────────────────
-- No direct restaurant_id; join through pending_processed_invoices.
ALTER TABLE pending_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_pending_line_items" ON pending_line_items
  FOR ALL
  USING (
    pending_invoice_id IN (
      SELECT ppi.id FROM pending_processed_invoices ppi
      WHERE ppi.restaurant_id IN (
        SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    pending_invoice_id IN (
      SELECT ppi.id FROM pending_processed_invoices ppi
      WHERE ppi.restaurant_id IN (
        SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
      )
    )
  );

-- ── 15. chat_sessions ────────────────────────────────────────────────────────
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_chat_sessions" ON chat_sessions
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
    )
  );

-- ── 16. chat_messages ────────────────────────────────────────────────────────
-- No direct restaurant_id; join through chat_sessions.
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_members_access_chat_messages" ON chat_messages
  FOR ALL
  USING (
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      WHERE cs.restaurant_id IN (
        SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      WHERE cs.restaurant_id IN (
        SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text
      )
    )
  );

-- ── 17. waitlist ─────────────────────────────────────────────────────────────
-- Public signup table: anyone can INSERT their email; no user should SELECT others'.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_join_waitlist" ON waitlist
  FOR INSERT
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policy for end-users — only service_role can read the list.
