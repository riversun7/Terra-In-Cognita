CREATE TABLE "facility_jobs" (
	"id" bigint PRIMARY KEY,
	"kind" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"building_id" bigint,
	"beacon_id" bigint,
	"holding_id" bigint,
	"target_level" smallint,
	"restore_ppm" integer,
	"unit_ids" bigint[] NOT NULL,
	"materials" jsonb NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"done_at_ms" bigint NOT NULL,
	CONSTRAINT "facility_jobs_kind" CHECK ("kind" in ('build', 'upgrade', 'repair', 'beacon_repair', 'equipment')),
	CONSTRAINT "facility_jobs_done" CHECK ("done_at_ms" >= "started_at_ms")
);
--> statement-breakpoint
CREATE TABLE "world_facilities" (
	"building_id" bigint PRIMARY KEY,
	"facility_id" text NOT NULL,
	"level" smallint NOT NULL,
	"condition_ppm" integer NOT NULL,
	"condition_at_ms" bigint NOT NULL,
	"built_at_ms" bigint NOT NULL,
	"built_by" uuid,
	CONSTRAINT "world_facilities_level" CHECK ("level" between 0 and 5),
	CONSTRAINT "world_facilities_condition" CHECK ("condition_ppm" between 0 and 1000000),
	CONSTRAINT "world_facilities_id_format" CHECK ("facility_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "territory_beacons" ADD COLUMN "condition_ppm" integer DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "territory_beacons" ADD COLUMN "condition_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "territory_beacons" ADD COLUMN "ready_at_ms" bigint;--> statement-breakpoint
CREATE INDEX "facility_jobs_building_idx" ON "facility_jobs" ("building_id");--> statement-breakpoint
ALTER TABLE "territory_beacons" ADD CONSTRAINT "territory_beacons_condition" CHECK ("condition_ppm" between 0 and 1000000);--> statement-breakpoint
ALTER TABLE "ledger_accounts" DROP CONSTRAINT "ledger_accounts_asset_format", ADD CONSTRAINT "ledger_accounts_asset_format" CHECK ("asset" ~ '^[a-z][a-z0-9_]{1,47}(:[a-z][a-z0-9_]{1,47})?$');