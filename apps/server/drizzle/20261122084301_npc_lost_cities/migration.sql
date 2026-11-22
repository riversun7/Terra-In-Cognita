CREATE TABLE "npc_lost_cities" (
	"faction_id" bigint,
	"city_id" bigint,
	"lost_at_ms" bigint NOT NULL,
	CONSTRAINT "npc_lost_cities_pkey" PRIMARY KEY("faction_id","city_id")
);
--> statement-breakpoint
ALTER TABLE "npc_lost_cities" ADD CONSTRAINT "npc_lost_cities_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");