CREATE TABLE "war_outcomes" (
	"id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"attacker_faction_id" bigint NOT NULL,
	"target_faction_id" bigint NOT NULL,
	"outcome" text NOT NULL,
	"share_choice" text,
	"at_ms" bigint NOT NULL,
	"until_ms" bigint,
	"next_tax_ms" bigint,
	"ended_at_ms" bigint,
	"taken" bigint DEFAULT 0 NOT NULL,
	"taken_asset" text,
	CONSTRAINT "war_outcomes_outcome" CHECK ("outcome" in ('loot', 'integrate', 'occupy')),
	CONSTRAINT "war_outcomes_share_choice" CHECK ("share_choice" is null or "share_choice" in ('keep', 'delist')),
	CONSTRAINT "war_outcomes_taken" CHECK ("taken" >= 0)
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "born_of" bigint;--> statement-breakpoint
ALTER TABLE "world_humans" ADD COLUMN "k_pm" smallint[];--> statement-breakpoint
CREATE INDEX "war_outcomes_attacker_idx" ON "war_outcomes" ("attacker_faction_id","at_ms");--> statement-breakpoint
CREATE INDEX "war_outcomes_target_idx" ON "war_outcomes" ("target_faction_id","at_ms");--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_born_of_factions_id_fkey" FOREIGN KEY ("born_of") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "war_outcomes" ADD CONSTRAINT "war_outcomes_attacker_faction_id_factions_id_fkey" FOREIGN KEY ("attacker_faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "war_outcomes" ADD CONSTRAINT "war_outcomes_target_faction_id_factions_id_fkey" FOREIGN KEY ("target_faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_k_pm" CHECK ("k_pm" is null or cardinality("k_pm") = 6);