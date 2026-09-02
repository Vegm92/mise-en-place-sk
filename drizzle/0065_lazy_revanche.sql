CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_categories_rid_name_key" ON "categories" USING btree ("restaurant_id","name_key");--> statement-breakpoint
CREATE INDEX "idx_categories_rid_hidden" ON "categories" USING btree ("restaurant_id","hidden");--> statement-breakpoint
-- Backfill (issue #881): seed every existing restaurant with the current
-- default taxonomy (VALID_CATEGORIES minus the 'Other' sentinel in
-- src/lib/constants.ts, which stays a fixed bucket and never becomes a row).
-- name_key/slug are the literal categoryKey()/categorySlug() outputs for each
-- name; sort_order is the entry's position in VALID_CATEGORIES. New
-- restaurants get the same seed at creation time via seedDefaultCategories()
-- in src/lib/server/categories.ts, so this statement only needs to run once.
INSERT INTO "categories" ("restaurant_id", "name", "name_key", "slug", "sort_order", "is_default")
SELECT r."id", v."name", v."name_key", v."slug", v."sort_order", true
FROM "restaurants" r
CROSS JOIN (VALUES
	('Frutas y Verduras', 'frutas y verduras', 'frutas-y-verduras', 0),
	('Carnes y Derivados', 'carnes y derivados', 'carnes-y-derivados', 1),
	('Pescados y Mariscos', 'pescados y mariscos', 'pescados-y-mariscos', 2),
	('Lácteos', 'lacteos', 'lacteos', 3),
	('Aceites y Conservas', 'aceites y conservas', 'aceites-y-conservas', 4),
	('Bebidas', 'bebidas', 'bebidas', 5),
	('Panadería y Bollería', 'panaderia y bolleria', 'panaderia-y-bolleria', 6),
	('Especias y Condimentos', 'especias y condimentos', 'especias-y-condimentos', 7),
	('Productos de Limpieza', 'productos de limpieza', 'productos-de-limpieza', 8),
	('Congelados', 'congelados', 'congelados', 9),
	('Embutidos y Charcutería', 'embutidos y charcuteria', 'embutidos-y-charcuteria', 10),
	('Vinos y Cavas', 'vinos y cavas', 'vinos-y-cavas', 11),
	('Café y Bebidas Calientes', 'cafe y bebidas calientes', 'cafe-y-bebidas-calientes', 12),
	('Mantenimiento y Reparaciones', 'mantenimiento y reparaciones', 'mantenimiento-y-reparaciones', 13),
	('Material y Menaje', 'material y menaje', 'material-y-menaje', 14),
	('Embalaje y Packaging', 'embalaje y packaging', 'embalaje-y-packaging', 15)
) AS v("name", "name_key", "slug", "sort_order")
ON CONFLICT ("restaurant_id", "name_key") DO NOTHING;