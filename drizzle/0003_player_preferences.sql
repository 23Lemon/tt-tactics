CREATE TABLE `player_preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`receive_groups` text NOT NULL,
	`revision` integer NOT NULL
);
