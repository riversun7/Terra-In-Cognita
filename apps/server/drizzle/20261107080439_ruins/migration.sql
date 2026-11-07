CREATE TABLE "restoration_contributions" (
	"ruin_id" bigint,
	"owner_id" bigint,
	"amount" bigint NOT NULL,
	CONSTRAINT "restoration_contributions_pkey" PRIMARY KEY("ruin_id","owner_id"),
	CONSTRAINT "restoration_contributions_amount" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "world_ruins" (
	"id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"map_key" bigint NOT NULL,
	"cell_x" integer NOT NULL,
	"cell_y" integer NOT NULL,
	"former_faction_id" bigint,
	"ruined_at_ms" bigint NOT NULL,
	"housing" integer DEFAULT 0 NOT NULL,
	"claimant_owner_id" bigint,
	"join_faction_id" bigint,
	"claimed_at_ms" bigint,
	"government_building_id" bigint,
	"goal" bigint,
	"currency" text,
	"open" boolean DEFAULT false NOT NULL,
	CONSTRAINT "world_ruins_claim" CHECK (("claimant_owner_id" is null) = ("join_faction_id" is null) and ("claimant_owner_id" is null) = ("goal" is null)),
	CONSTRAINT "world_ruins_goal" CHECK ("goal" is null or "goal" > 0),
	CONSTRAINT "world_ruins_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE INDEX "world_ruins_map_idx" ON "world_ruins" ("map_key");--> statement-breakpoint
ALTER TABLE "restoration_contributions" ADD CONSTRAINT "restoration_contributions_ruin_id_world_ruins_id_fkey" FOREIGN KEY ("ruin_id") REFERENCES "world_ruins"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "restoration_contributions" ADD CONSTRAINT "restoration_contributions_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "world_ruins" ADD CONSTRAINT "world_ruins_former_faction_id_factions_id_fkey" FOREIGN KEY ("former_faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "world_ruins" ADD CONSTRAINT "world_ruins_claimant_owner_id_world_owners_id_fkey" FOREIGN KEY ("claimant_owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "world_ruins" ADD CONSTRAINT "world_ruins_join_faction_id_factions_id_fkey" FOREIGN KEY ("join_faction_id") REFERENCES "factions"("id");