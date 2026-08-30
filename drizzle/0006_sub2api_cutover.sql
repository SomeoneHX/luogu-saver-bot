ALTER TABLE `newapi_bindings` RENAME TO `legacy_newapi_bindings`;
--> statement-breakpoint
ALTER TABLE `newapi_plan_redemptions` RENAME TO `legacy_newapi_plan_redemptions`;
--> statement-breakpoint
CREATE TABLE `sub2api_bindings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`sub2api_user_id` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sub2api_bindings_sub2api_user_unique` ON `sub2api_bindings` (`sub2api_user_id`);
