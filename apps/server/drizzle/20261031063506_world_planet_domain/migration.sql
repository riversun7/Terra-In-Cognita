ALTER TABLE "world_buildings" ADD COLUMN "planet_id" text DEFAULT 's2_test_planet' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD COLUMN "domain" text DEFAULT 'land' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_exploration" ADD COLUMN "planet_id" text DEFAULT 's2_test_planet' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_units" ADD COLUMN "planet_id" text DEFAULT 's2_test_planet' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_units" ADD COLUMN "domain" text DEFAULT 'land' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$');--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_domain" CHECK ("domain" in ('space', 'sky', 'land', 'sea'));--> statement-breakpoint
ALTER TABLE "world_exploration" ADD CONSTRAINT "world_exploration_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$');--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$');--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_domain" CHECK ("domain" in ('space', 'sky', 'land', 'sea'));