ALTER TABLE "products" ADD COLUMN "allergens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allergens_source" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kcal_100" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "protein_100" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "carbs_100" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fat_100" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_source" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_allergens_source_valid" CHECK ("products"."allergens_source" IS NULL OR "products"."allergens_source" IN ('manual','extracted'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_nutrition_source_valid" CHECK ("products"."nutrition_source" IS NULL OR "products"."nutrition_source" IN ('manual','extracted'));