CREATE TABLE "supplier_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"supplier_id" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "normalized_cif" text;--> statement-breakpoint
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_aliases_rid_normalized_name" ON "supplier_aliases" USING btree ("restaurant_id","normalized_name");--> statement-breakpoint
CREATE INDEX "supplier_aliases_supplier_idx" ON "supplier_aliases" USING btree ("restaurant_id","supplier_id");--> statement-breakpoint
CREATE INDEX "suppliers_rid_normalized_cif_idx" ON "suppliers" USING btree ("restaurant_id","normalized_cif") WHERE "suppliers"."normalized_cif" IS NOT NULL;--> statement-breakpoint
UPDATE "suppliers" SET "normalized_cif" = NULLIF(
	CASE
		WHEN upper(regexp_replace("cif", '[^0-9A-Za-z]', '', 'g')) ~ '^ES[0-9A-Z]{9}$'
			THEN substring(upper(regexp_replace("cif", '[^0-9A-Za-z]', '', 'g')) from 3)
		ELSE upper(regexp_replace("cif", '[^0-9A-Za-z]', '', 'g'))
	END, '')
WHERE "cif" IS NOT NULL AND "normalized_cif" IS NULL;
