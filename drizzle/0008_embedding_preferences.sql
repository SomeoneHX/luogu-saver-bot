ALTER TABLE `message_embedding_opt_outs` RENAME TO `message_embedding_preferences`;
--> statement-breakpoint
ALTER TABLE `message_embedding_preferences` RENAME COLUMN `opted_out_at` TO `updated_at`;
--> statement-breakpoint
ALTER TABLE `message_embedding_preferences` ADD `opted_out` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `message_embedding_preferences` ADD `revision` integer DEFAULT 1 NOT NULL;
