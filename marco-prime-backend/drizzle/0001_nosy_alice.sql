CREATE TABLE `idempotency_keys` (
	`transaction_id` varchar(36) NOT NULL,
	`scope` varchar(20) NOT NULL,
	`request_hash` varchar(64) NOT NULL,
	`response_json` longtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idempotency_keys_transaction_id` PRIMARY KEY(`transaction_id`)
);
--> statement-breakpoint
CREATE TABLE `order_corrections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`original_order_id` bigint unsigned NOT NULL,
	`kind` varchar(20) NOT NULL,
	`admin_member_id` bigint unsigned NOT NULL,
	`reason` varchar(250) NOT NULL,
	`refund_order_id` bigint unsigned NOT NULL,
	`replacement_order_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_corrections_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_corrections_original_unique` UNIQUE(`original_order_id`)
);
--> statement-breakpoint
ALTER TABLE `members` ADD CONSTRAINT `members_card_number_unique` UNIQUE(`card_number`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_at_idx` ON `idempotency_keys` (`created_at`);--> statement-breakpoint
CREATE INDEX `order_corrections_refund_idx` ON `order_corrections` (`refund_order_id`);--> statement-breakpoint
CREATE INDEX `order_corrections_replacement_idx` ON `order_corrections` (`replacement_order_id`);--> statement-breakpoint
CREATE INDEX `members_class_idx` ON `members` (`class`);--> statement-breakpoint
CREATE INDEX `orders_date_idx` ON `orders` (`date`);--> statement-breakpoint
CREATE INDEX `orders_member_idx` ON `orders` (`member_id`);--> statement-breakpoint
CREATE INDEX `orders_product_idx` ON `orders` (`product_id`);--> statement-breakpoint
CREATE INDEX `products_product_type_idx` ON `products` (`product_type_id`);