ALTER TABLE "gardener_waves" ADD COLUMN "kind" text DEFAULT 'city' NOT NULL;--> statement-breakpoint
ALTER TABLE "gardener_waves" ADD COLUMN "reward" jsonb;--> statement-breakpoint
ALTER TABLE "gardener_waves" ADD CONSTRAINT "gardener_waves_kind" CHECK ("kind" in ('city', 'protection'));