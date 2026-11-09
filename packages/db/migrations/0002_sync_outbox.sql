CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`hlc` text NOT NULL,
	`queued_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_row_idx` ON `outbox` (`table_name`,`row_id`);--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `accounts_outbox_i` AFTER INSERT ON `accounts`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('accounts', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `accounts_outbox_u` AFTER UPDATE ON `accounts`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('accounts', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `categories_outbox_i` AFTER INSERT ON `categories`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('categories', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `categories_outbox_u` AFTER UPDATE ON `categories`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('categories', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transactions_outbox_i` AFTER INSERT ON `transactions`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transactions', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transactions_outbox_u` AFTER UPDATE ON `transactions`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transactions', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transaction_splits_outbox_i` AFTER INSERT ON `transaction_splits`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transaction_splits', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transaction_splits_outbox_u` AFTER UPDATE ON `transaction_splits`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transaction_splits', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `tags_outbox_i` AFTER INSERT ON `tags`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('tags', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `tags_outbox_u` AFTER UPDATE ON `tags`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('tags', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transaction_tags_outbox_i` AFTER INSERT ON `transaction_tags`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transaction_tags', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `transaction_tags_outbox_u` AFTER UPDATE ON `transaction_tags`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('transaction_tags', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `budgets_outbox_i` AFTER INSERT ON `budgets`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('budgets', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `budgets_outbox_u` AFTER UPDATE ON `budgets`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('budgets', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `recurring_rules_outbox_i` AFTER INSERT ON `recurring_rules`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('recurring_rules', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `recurring_rules_outbox_u` AFTER UPDATE ON `recurring_rules`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('recurring_rules', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `goals_outbox_i` AFTER INSERT ON `goals`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('goals', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `goals_outbox_u` AFTER UPDATE ON `goals`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('goals', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `debts_outbox_i` AFTER INSERT ON `debts`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('debts', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `debts_outbox_u` AFTER UPDATE ON `debts`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('debts', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `rules_outbox_i` AFTER INSERT ON `rules`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('rules', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `rules_outbox_u` AFTER UPDATE ON `rules`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('rules', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `payee_aliases_outbox_i` AFTER INSERT ON `payee_aliases`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('payee_aliases', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `payee_aliases_outbox_u` AFTER UPDATE ON `payee_aliases`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('payee_aliases', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `attachments_outbox_i` AFTER INSERT ON `attachments`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('attachments', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `attachments_outbox_u` AFTER UPDATE ON `attachments`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('attachments', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `import_profiles_outbox_i` AFTER INSERT ON `import_profiles`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('import_profiles', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
--> statement-breakpoint
CREATE TRIGGER `import_profiles_outbox_u` AFTER UPDATE ON `import_profiles`
WHEN NOT EXISTS (SELECT 1 FROM `sync_meta` WHERE `key` = 'outbox_suspended')
BEGIN
INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)
VALUES ('import_profiles', NEW.`id`, CASE WHEN NEW.`deleted_at` IS NULL THEN 'put' ELSE 'delete' END, NEW.`hlc`, NEW.`updated_at`, 0, NULL)
ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;
END
