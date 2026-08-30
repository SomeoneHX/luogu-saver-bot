CREATE TABLE `recharge_daily_usages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`day_key` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recharge_daily_usages_user_day_unique` ON `recharge_daily_usages` (`user_id`,`day_key`);