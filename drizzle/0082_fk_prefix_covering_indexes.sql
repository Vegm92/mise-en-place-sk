-- Migration 0082: 8 more FKs missing a covering index, found by a pg_index
-- sweep after 0081 (system-design-audit.md §7). Same class as 0081, but a
-- different shape: each of these tables already has an index that leads
-- with another column (usually restaurant_id) and only carries the FK
-- column second-or-later, so Postgres can't use it for the FK's equality
-- lookup — the FK column has to be the leading key of some index.
--
-- The audit's original list of 11 also named recipe_items.recipe_id and
-- recipe_items.child_recipe_id, plus invoices.linked_invoice_id turned up
-- by this sweep. All three are false positives: their only relevant index
-- is a partial one restricted to `WHERE <col> IS NOT NULL`, but an FK check
-- never runs with a null value for that column (MATCH SIMPLE skips it), so
-- the planner can prove the lookup satisfies the partial predicate and uses
-- the index anyway — verified with EXPLAIN (enable_seqscan off) against
-- idx_recipe_items_rid_child and idx_invoices_linked_invoice_id. That is
-- the opposite failure mode from 0081's, where a partial WHERE excluded
-- rows the FK check actually needed; a `col IS NOT NULL` partial index is
-- fine because it only ever excludes rows the check can't need anyway.
--
-- Same reasoning as 0081 on cost: none of this is urgent at the measured
-- volume (0.247 GB total, Postgres CPU avg 0.014 vCPU of 8). Plain
-- `CREATE INDEX`, not `CONCURRENTLY`, for the same drizzle-kit-transaction
-- reason as 0081.
CREATE INDEX "invoice_line_items_product_idx" ON "invoice_line_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_aliases_product_id_idx" ON "product_aliases" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_aliases_supplier_idx" ON "product_aliases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "recipe_items_product_idx" ON "recipe_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "supplier_aliases_supplier_id_idx" ON "supplier_aliases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "system_notifications_invoice_idx" ON "system_notifications" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "unit_conversions_supplier_idx" ON "unit_conversions" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "user_restaurants_restaurant_idx" ON "user_restaurants" USING btree ("restaurant_id");
