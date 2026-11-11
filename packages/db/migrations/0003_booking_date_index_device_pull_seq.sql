ALTER TABLE `devices` ADD `last_pull_seq` integer;--> statement-breakpoint
CREATE INDEX `transactions_booking_date_idx` ON `transactions` (`booking_date`);