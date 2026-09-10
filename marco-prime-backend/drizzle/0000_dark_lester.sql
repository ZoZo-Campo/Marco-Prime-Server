CREATE TABLE `members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`last_name` varchar(50) NOT NULL,
	`first_name` varchar(50) NOT NULL,
	`card_number` bigint,
	`email` varchar(255) NOT NULL,
	`phone` varchar(50),
	`balance` decimal(10,2) NOT NULL DEFAULT '0.00',
	`admin` boolean NOT NULL DEFAULT false,
	`contributor` boolean NOT NULL DEFAULT false,
	`birth_date` date,
	`sector` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`class` int,
	CONSTRAINT `members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned,
	`member_id` bigint unsigned,
	`price` decimal(10,2) NOT NULL,
	`amount` int NOT NULL,
	`date` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_types` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`type` varchar(50) NOT NULL,
	CONSTRAINT `product_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`title` varchar(25) NOT NULL,
	`price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`product_type_id` bigint unsigned NOT NULL,
	`color` varchar(50),
	`available` boolean NOT NULL DEFAULT true,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE no action ON UPDATE no action;