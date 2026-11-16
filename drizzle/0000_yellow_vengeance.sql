CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`hand` text NOT NULL,
	`steps` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `routines_owner_updated` ON `routines` (`owner`,`updated_at`);