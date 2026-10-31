CREATE TABLE "world_battle_results" (
	"battle_id" bigint PRIMARY KEY,
	"applied_at_ms" bigint NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
DROP INDEX "ledger_accounts_owner_asset_idx";--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "location" bigint;--> statement-breakpoint
ALTER TABLE "world_units" ADD COLUMN "injury" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_units" ADD COLUMN "injury_until_ms" bigint;--> statement-breakpoint
ALTER TABLE "world_units" ADD COLUMN "held_by" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_owner_asset_location_idx" ON "ledger_accounts" ("owner_id","asset",coalesce("location", 0));--> statement-breakpoint
ALTER TABLE "world_battle_results" ADD CONSTRAINT "world_battle_results_battle_id_world_battles_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "world_battles"("id");--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_held_by_world_owners_id_fkey" FOREIGN KEY ("held_by") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_injury" CHECK ("injury" between 0 and 3);--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_injury_until" CHECK (("injury" = 0) = ("injury_until_ms" is null));--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_held_by_other" CHECK ("held_by" is null or "held_by" <> "owner_id");