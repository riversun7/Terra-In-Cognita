CREATE TABLE "boat_facilities" (
	"building_id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"access" text NOT NULL,
	"fee" bigint NOT NULL,
	"module" text,
	CONSTRAINT "boat_facilities_access" CHECK ("access" in ('owner', 'nation', 'peace')),
	CONSTRAINT "boat_facilities_module" CHECK ("module" is null or "module" in ('docks', 'build', 'repair')),
	CONSTRAINT "boat_facilities_fee" CHECK ("fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "boat_resets" (
	"planet_id" text PRIMARY KEY,
	"applied_at_ms" bigint NOT NULL,
	"report" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boat_states" (
	"boat_id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"type_id" text NOT NULL,
	"hull_ppm" integer NOT NULL,
	"hull_at_ms" bigint NOT NULL,
	"home_id" bigint,
	"fee_paid_to_ms" bigint,
	"arrears" integer DEFAULT 0 NOT NULL,
	"trade_id" bigint,
	"trade_until_ms" bigint,
	"trade_charged_to_ms" bigint,
	CONSTRAINT "boat_states_hull" CHECK ("hull_ppm" between 0 and 1000000),
	CONSTRAINT "boat_states_arrears" CHECK ("arrears" >= 0)
);
--> statement-breakpoint
ALTER TABLE "boat_jobs" ADD COLUMN "kind" text DEFAULT 'build' NOT NULL;--> statement-breakpoint
ALTER TABLE "boat_jobs" ADD COLUMN "type_id" text;--> statement-breakpoint
ALTER TABLE "boat_jobs" ADD COLUMN "boat_id" bigint;--> statement-breakpoint
CREATE INDEX "boat_states_home_idx" ON "boat_states" ("home_id");--> statement-breakpoint
ALTER TABLE "boat_jobs" ADD CONSTRAINT "boat_jobs_kind" CHECK ("kind" in ('build', 'repair'));