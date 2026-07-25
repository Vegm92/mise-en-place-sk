ALTER TABLE "restaurants" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_parent_id_restaurants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restaurants_parent_idx" ON "restaurants" USING btree ("parent_id");