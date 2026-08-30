CREATE TABLE `newapi_plan_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`plan_id` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `newapi_plan_redemptions_user_plan_unique` ON `newapi_plan_redemptions` (`user_id`,`plan_id`);
