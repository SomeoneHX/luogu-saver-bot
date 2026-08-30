CREATE TABLE `group_message_embedding_means` (
	`group_id` integer PRIMARY KEY NOT NULL,
	`space_key` text NOT NULL,
	`dimensions` integer NOT NULL,
	`mean_vector` blob NOT NULL,
	`sample_count` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_message_embedding_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`space_key` text NOT NULL,
	`dimensions` integer NOT NULL,
	`feature_vector` blob NOT NULL,
	`effective_weight` real NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_embedding_opt_outs` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`opted_out_at` integer NOT NULL
);
