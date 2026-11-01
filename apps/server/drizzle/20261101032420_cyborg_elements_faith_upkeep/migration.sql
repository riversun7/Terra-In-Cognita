ALTER TABLE "cyborgs" ADD COLUMN "elements" smallint[];--> statement-breakpoint
ALTER TABLE "cyborgs" ADD COLUMN "religion" text;--> statement-breakpoint
ALTER TABLE "cyborgs" ADD COLUMN "faith_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cyborgs" ADD COLUMN "start_grant" bigint;--> statement-breakpoint
ALTER TABLE "world_owners" ADD COLUMN "upkeep_unpaid_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_elements" CHECK ("elements" is null or (cardinality("elements") = 12 and 0 <= all("elements") and 10 >= all("elements")));--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_religion_format" CHECK ("religion" is null or "religion" ~ '^[a-z][a-z0-9_]{1,47}$');--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_faith_points" CHECK ("faith_points" >= 0);--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_start_grant" CHECK ("start_grant" is null or "start_grant" >= 0);