CREATE TABLE "npc_house_units" (
	"unit_id" bigint PRIMARY KEY,
	"house_id" bigint NOT NULL,
	"set_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_houses" (
	"id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL UNIQUE,
	"name" text NOT NULL,
	"founded_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "house_entry_fee" bigint;--> statement-breakpoint
ALTER TABLE "house_homes" ADD COLUMN "pending_city_id" bigint;--> statement-breakpoint
ALTER TABLE "house_homes" ADD COLUMN "pending_at_ms" bigint;--> statement-breakpoint
CREATE INDEX "npc_house_units_house_idx" ON "npc_house_units" ("house_id");--> statement-breakpoint
ALTER TABLE "npc_house_units" ADD CONSTRAINT "npc_house_units_house_id_npc_houses_id_fkey" FOREIGN KEY ("house_id") REFERENCES "npc_houses"("id") ON DELETE CASCADE;