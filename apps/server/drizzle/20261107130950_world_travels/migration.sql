CREATE TABLE "world_travels" (
	"unit_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"kind" text NOT NULL,
	"route" bigint[] NOT NULL,
	"leg" integer NOT NULL,
	"target_x" integer NOT NULL,
	"target_y" integer NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"arrive_at_ms" bigint NOT NULL,
	CONSTRAINT "world_travels_kind" CHECK ("kind" in ('move', 'scout')),
	CONSTRAINT "world_travels_leg" CHECK (cardinality("route") >= 1 and "leg" >= 0 and "leg" < cardinality("route")),
	CONSTRAINT "world_travels_target" CHECK ("target_x" between 0 and 255 and "target_y" between 0 and 255)
);
--> statement-breakpoint
CREATE INDEX "world_travels_owner_idx" ON "world_travels" ("owner_id");