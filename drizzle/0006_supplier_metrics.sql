CREATE TABLE IF NOT EXISTS `supplier_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL UNIQUE REFERENCES `suppliers`(`id`),
	`score` integer NOT NULL DEFAULT 0,
	`price_stability_score` integer NOT NULL DEFAULT 0,
	`frequency_score` integer NOT NULL DEFAULT 0,
	`timeliness_score` integer NOT NULL DEFAULT 0,
	`price_stability_cv` real,
	`computed_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `contact_email` text;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `notes` text;
