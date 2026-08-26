CREATE TABLE "recipe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"recipe_id" integer NOT NULL,
	"kind" text DEFAULT 'free' NOT NULL,
	"name" text NOT NULL,
	"product_id" integer,
	"child_recipe_id" integer,
	"net_quantity" numeric(14, 4) NOT NULL,
	"unit" text,
	"unit_cost" numeric(12, 4),
	"waste_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kcal_100" numeric(8, 2),
	"protein_100" numeric(8, 2),
	"carbs_100" numeric(8, 2),
	"fat_100" numeric(8, 2),
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_items_kind_valid" CHECK ("recipe_items"."kind" IN ('free','product','recipe')),
	CONSTRAINT "recipe_items_kind_refs" CHECK (("recipe_items"."kind" = 'free' AND "recipe_items"."product_id" IS NULL AND "recipe_items"."child_recipe_id" IS NULL) OR ("recipe_items"."kind" = 'product' AND "recipe_items"."child_recipe_id" IS NULL) OR ("recipe_items"."kind" = 'recipe' AND "recipe_items"."product_id" IS NULL AND "recipe_items"."child_recipe_id" IS NOT NULL)),
	CONSTRAINT "recipe_items_no_self_ref" CHECK ("recipe_items"."child_recipe_id" IS NULL OR "recipe_items"."child_recipe_id" <> "recipe_items"."recipe_id"),
	CONSTRAINT "recipe_items_qty_pos" CHECK ("recipe_items"."net_quantity" > 0),
	CONSTRAINT "recipe_items_waste_range" CHECK ("recipe_items"."waste_pct" >= 0 AND "recipe_items"."waste_pct" < 100)
);--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"kind" text DEFAULT 'plato' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"section" text,
	"portions" numeric(10, 3) DEFAULT '1' NOT NULL,
	"yield_qty" numeric(14, 4),
	"yield_unit" text,
	"selling_price" numeric(12, 2),
	"vat_pct" numeric(5, 2),
	"target_food_cost_pct" numeric(5, 2),
	"preparation" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipes_kind_valid" CHECK ("recipes"."kind" IN ('plato','elaboracion')),
	CONSTRAINT "recipes_status_valid" CHECK ("recipes"."status" IN ('draft','active','archived')),
	CONSTRAINT "recipes_portions_pos" CHECK ("recipes"."portions" > 0),
	CONSTRAINT "recipes_yield_pos" CHECK ("recipes"."yield_qty" IS NULL OR "recipes"."yield_qty" > 0),
	CONSTRAINT "recipes_vat_range" CHECK ("recipes"."vat_pct" IS NULL OR ("recipes"."vat_pct" >= 0 AND "recipes"."vat_pct" <= 100)),
	CONSTRAINT "recipes_target_fc_range" CHECK ("recipes"."target_food_cost_pct" IS NULL OR ("recipes"."target_food_cost_pct" > 0 AND "recipes"."target_food_cost_pct" <= 100))
);--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipes_id_rid" ON "recipes" USING btree ("id","restaurant_id");--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_fk" FOREIGN KEY ("recipe_id","restaurant_id") REFERENCES "public"."recipes"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_child_fk" FOREIGN KEY ("child_recipe_id","restaurant_id") REFERENCES "public"."recipes"("id","restaurant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recipe_items_rid_recipe" ON "recipe_items" USING btree ("restaurant_id","recipe_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_recipe_items_rid_child" ON "recipe_items" USING btree ("restaurant_id","child_recipe_id") WHERE "recipe_items"."child_recipe_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_recipe_items_rid_product" ON "recipe_items" USING btree ("restaurant_id","product_id") WHERE "recipe_items"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipes_rid_name_key" ON "recipes" USING btree ("restaurant_id","name_key");--> statement-breakpoint
CREATE INDEX "idx_recipes_rid_status" ON "recipes" USING btree ("restaurant_id","status");