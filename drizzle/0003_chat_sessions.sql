CREATE TABLE `chat_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL DEFAULT 'Nueva conversación',
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE TABLE `chat_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_id` integer REFERENCES `chat_sessions`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `text` text NOT NULL,
  `actions` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
