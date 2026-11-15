ALTER TABLE "boat_facilities" ADD COLUMN "modules" text;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "owner_id" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "yard_id" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "yard_since_ms" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "yard_map_key" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "yard_x" integer;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "yard_y" integer;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "fuel_milli" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "fuel_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "overheat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "cool_until_ms" bigint;--> statement-breakpoint
ALTER TABLE "boat_states" ADD COLUMN "crew" jsonb;--> statement-breakpoint
CREATE INDEX "boat_states_yard_idx" ON "boat_states" ("yard_id");--> statement-breakpoint
ALTER TABLE "boat_states" ADD CONSTRAINT "boat_states_fuel" CHECK ("fuel_milli" is null or "fuel_milli" >= 0);