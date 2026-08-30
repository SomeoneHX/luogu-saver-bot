CREATE TABLE `caves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_name` text NOT NULL,
	`sender_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`raw_text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` integer,
	`alias` text NOT NULL,
	`target_command` text NOT NULL,
	`arg_template` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_alias_scope_alias_unique` ON `command_aliases` (`scope_type`,`scope_id`,`alias`);--> statement-breakpoint
CREATE TABLE `command_bans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`command_name` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` integer,
	`banned_by` integer NOT NULL,
	`banned_at` integer NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_bans_user_command_scope_unique` ON `command_bans` (`user_id`,`command_name`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `gacha_pools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`items` text NOT NULL,
	`end_at` integer NOT NULL,
	`group_id` integer NOT NULL,
	`totalized` integer DEFAULT false NOT NULL,
	`min_level` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gacha_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pool_id` integer NOT NULL,
	`user_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gacha_records_user_pool_unique` ON `gacha_records` (`user_id`,`pool_id`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`option_index` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poll_votes_poll_group_user_unique` ON `poll_votes` (`poll_id`,`group_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`options` text NOT NULL,
	`min_level` integer DEFAULT 0 NOT NULL,
	`is_closed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE TABLE `binds` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`lid` integer NOT NULL
);
