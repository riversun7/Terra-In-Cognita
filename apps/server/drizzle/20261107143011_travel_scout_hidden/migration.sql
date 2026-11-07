ALTER TABLE "world_travels" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "world_travels" ADD COLUMN "origin_map_key" bigint;--> statement-breakpoint
ALTER TABLE "world_travels" ADD COLUMN "origin_x" integer;--> statement-breakpoint
ALTER TABLE "world_travels" ADD COLUMN "origin_y" integer;--> statement-breakpoint
ALTER TABLE "world_travels" ADD COLUMN "scouted_map_key" bigint;--> statement-breakpoint
ALTER TABLE "world_travels" ADD COLUMN "hidden_until_ms" bigint;--> statement-breakpoint
ALTER TABLE "world_travels" ADD CONSTRAINT "world_travels_origin" CHECK (("origin_x" is null or "origin_x" between 0 and 255) and ("origin_y" is null or "origin_y" between 0 and 255));