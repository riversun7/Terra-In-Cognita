CREATE TABLE "city_policies" (
	"city_id" bigint PRIMARY KEY,
	"house_entry_fee" bigint,
	"set_at_ms" bigint NOT NULL,
	"set_by" uuid
);
--> statement-breakpoint
ALTER TABLE "npc_houses" DROP CONSTRAINT "npc_houses_city_id_key";--> statement-breakpoint
CREATE INDEX "npc_houses_city_idx" ON "npc_houses" ("city_id");