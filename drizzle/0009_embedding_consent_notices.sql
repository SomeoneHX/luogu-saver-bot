ALTER TABLE `message_embedding_preferences` ADD `notice_sent_at` integer;
--> statement-breakpoint
ALTER TABLE `message_embedding_preferences` ADD `last_spoke_at` integer;
--> statement-breakpoint
UPDATE `message_embedding_preferences`
SET `notice_sent_at` = `updated_at`;
--> statement-breakpoint
INSERT INTO `message_embedding_preferences` (
    `user_id`,
    `opted_out`,
    `revision`,
    `updated_at`,
    `notice_sent_at`,
    `last_spoke_at`
)
SELECT
    `user_id`,
    0,
    0,
    `updated_at`,
    NULL,
    `updated_at`
FROM `user_message_embedding_profiles`
WHERE true
ON CONFLICT (`user_id`) DO UPDATE SET
    `last_spoke_at` = excluded.`last_spoke_at`
WHERE `message_embedding_preferences`.`opted_out` = 0;
--> statement-breakpoint
CREATE INDEX `message_embedding_preferences_last_spoke_at_index`
ON `message_embedding_preferences` (`last_spoke_at`);
