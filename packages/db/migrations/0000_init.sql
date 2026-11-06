CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`color` text,
	`icon` text,
	`opening_balance` integer NOT NULL,
	`include_in_net_worth` integer NOT NULL,
	`archived` integer NOT NULL,
	`bank_link_id` text,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_server_seq_idx` ON `accounts` (`server_seq`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`transaction_id` text NOT NULL,
	`file_path` text NOT NULL,
	`mime` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_server_seq_idx` ON `attachments` (`server_seq`);--> statement-breakpoint
CREATE INDEX `attachments_tx_idx` ON `attachments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`period` text NOT NULL,
	`start` text NOT NULL,
	`end` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`rollover` integer NOT NULL,
	`scope` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_server_seq_idx` ON `budgets` (`server_seq`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`parent_id` text,
	`type` text NOT NULL,
	`icon` text,
	`color` text,
	`archived` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`system_key` text
);
--> statement-breakpoint
CREATE INDEX `categories_server_seq_idx` ON `categories` (`server_seq`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `categories_user_system_key_idx` ON `categories` (`user_id`,`system_key`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`person` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`settled` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `debts_server_seq_idx` ON `debts` (`server_seq`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`date` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` text NOT NULL,
	PRIMARY KEY(`date`, `base`, `quote`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`currency` text NOT NULL,
	`deadline` text,
	`account_ids` text NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE INDEX `goals_server_seq_idx` ON `goals` (`server_seq`);--> statement-breakpoint
CREATE TABLE `payee_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`pattern` text NOT NULL,
	`payee` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payee_aliases_server_seq_idx` ON `payee_aliases` (`server_seq`);--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`template` text NOT NULL,
	`rrule` text NOT NULL,
	`next_date` text NOT NULL,
	`auto_detected` integer NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recurring_rules_server_seq_idx` ON `recurring_rules` (`server_seq`);--> statement-breakpoint
CREATE INDEX `recurring_rules_next_date_idx` ON `recurring_rules` (`next_date`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`conditions` text NOT NULL,
	`action` text NOT NULL,
	`priority` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rules_server_seq_idx` ON `rules` (`server_seq`);--> statement-breakpoint
CREATE INDEX `rules_priority_idx` ON `rules` (`user_id`,`priority`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`name` text NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE INDEX `tags_server_seq_idx` ON `tags` (`server_seq`);--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`transaction_id` text NOT NULL,
	`category_id` text,
	`amount` integer NOT NULL,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transaction_splits_server_seq_idx` ON `transaction_splits` (`server_seq`);--> statement-breakpoint
CREATE INDEX `transaction_splits_tx_idx` ON `transaction_splits` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transaction_tags_server_seq_idx` ON `transaction_tags` (`server_seq`);--> statement-breakpoint
CREATE INDEX `transaction_tags_tx_idx` ON `transaction_tags` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_tags_tag_idx` ON `transaction_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hlc` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`booking_date` text NOT NULL,
	`value_date` text,
	`payee` text NOT NULL,
	`description_raw` text NOT NULL,
	`description_clean` text NOT NULL,
	`category_id` text,
	`status` text NOT NULL,
	`kind` text NOT NULL,
	`transfer_peer_id` text,
	`notes` text NOT NULL,
	`excluded_from_reports` integer NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`dedup_hash` text NOT NULL,
	`import_batch_id` text,
	`debt_id` text,
	`categorization_method` text NOT NULL,
	`categorization_confidence` real NOT NULL,
	`needs_review` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_server_seq_idx` ON `transactions` (`server_seq`);--> statement-breakpoint
CREATE INDEX `transactions_account_date_idx` ON `transactions` (`account_id`,`booking_date`);--> statement-breakpoint
CREATE INDEX `transactions_dedup_hash_idx` ON `transactions` (`dedup_hash`);--> statement-breakpoint
CREATE INDEX `transactions_external_id_idx` ON `transactions` (`external_id`);--> statement-breakpoint
CREATE INDEX `transactions_needs_review_idx` ON `transactions` (`needs_review`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_debt_idx` ON `transactions` (`debt_id`);