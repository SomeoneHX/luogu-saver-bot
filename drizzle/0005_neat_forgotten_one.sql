CREATE TABLE `group_blacklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_blacklists_group_user_unique` ON `group_blacklists` (`group_id`,`user_id`);
