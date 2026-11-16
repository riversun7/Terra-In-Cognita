ALTER TABLE "boat_jobs" ADD COLUMN "price" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "gear" jsonb;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "price" bigint;