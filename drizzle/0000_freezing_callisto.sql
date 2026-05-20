CREATE TABLE IF NOT EXISTS `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `category_budgets` (
	`category` text PRIMARY KEY NOT NULL,
	`monthly_budget` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invoice_line_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer,
	`description` text,
	`quantity` real,
	`unit` text,
	`unit_price` real,
	`total_price` real,
	`requires_unit_conversion` integer DEFAULT 0,
	`canonical_unit` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer,
	`invoice_number` text,
	`invoice_date` text,
	`due_date` text,
	`total_amount` real,
	`currency` text,
	`status` text DEFAULT 'pending',
	`source_file` text,
	`confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`converted_amount` real,
	`exchange_rate` real,
	`notes` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pending_line_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pending_invoice_id` integer,
	`raw_description` text,
	`matched_ingredient_id` integer,
	`suggested_name` text,
	`quantity` real,
	`unit` text,
	`unit_price` real,
	`fuzzy_score` real,
	`price_warning` integer DEFAULT 0,
	FOREIGN KEY (`pending_invoice_id`) REFERENCES `pending_processed_invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pending_processed_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`original_file_path` text,
	`raw_llm_json` text,
	`status` text DEFAULT 'PENDING_REVIEW',
	`confidence_score` real,
	`supplier_id` integer,
	`inferred_supplier_name` text,
	`invoice_number` text,
	`invoice_date` text,
	`total_amount` real,
	`is_duplicate` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`committed_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient` text NOT NULL,
	`current_stock` real DEFAULT 0,
	`canonical_unit` text,
	`daily_burn_rate` real DEFAULT 0,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `stock_levels_ingredient_unique` ON `stock_levels` (`ingredient`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`alias` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`category` text DEFAULT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `system_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer,
	`notification_type` text NOT NULL,
	`message` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `unit_conversions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_name` text NOT NULL,
	`ingredient` text NOT NULL,
	`purchase_unit` text NOT NULL,
	`canonical_unit` text NOT NULL,
	`conversion_factor` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unit_conversions_supplier_ingredient_unit_unique` ON `unit_conversions` (`supplier_name`,`ingredient`,`purchase_unit`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
