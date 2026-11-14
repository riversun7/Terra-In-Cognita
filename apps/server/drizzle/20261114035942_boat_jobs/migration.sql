CREATE TABLE "boat_jobs" (
	"id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"building_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"materials" jsonb NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"done_at_ms" bigint NOT NULL,
	CONSTRAINT "boat_jobs_time" CHECK ("done_at_ms" >= "started_at_ms")
);
--> statement-breakpoint
CREATE INDEX "boat_jobs_building_idx" ON "boat_jobs" ("building_id");