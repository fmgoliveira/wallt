ALTER TABLE `attachments` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `sha256` text DEFAULT '' NOT NULL;