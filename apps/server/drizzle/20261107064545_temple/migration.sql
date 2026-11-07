CREATE TABLE "temple_devotions" (
	"owner_id" bigint PRIMARY KEY,
	"last_prayed_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temple_guardians" (
	"unit_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"city_id" bigint NOT NULL,
	"temple_id" bigint NOT NULL,
	"level" smallint NOT NULL,
	"rebirths" smallint NOT NULL,
	"stats" smallint[] NOT NULL,
	"elements" smallint[],
	"faith" smallint NOT NULL,
	"deified_at_ms" bigint NOT NULL,
	CONSTRAINT "temple_guardians_level" CHECK ("level" >= 1 and "rebirths" >= 0),
	CONSTRAINT "temple_guardians_stats" CHECK (cardinality("stats") = 6),
	CONSTRAINT "temple_guardians_elements" CHECK ("elements" is null or (cardinality("elements") = 12 and 0 <= all("elements") and 10 >= all("elements"))),
	CONSTRAINT "temple_guardians_faith" CHECK ("faith" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "unit_faith" (
	"unit_id" bigint PRIMARY KEY,
	"faith" smallint DEFAULT 0 NOT NULL,
	"faith_points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "unit_faith_faith" CHECK ("faith" between 0 and 100),
	CONSTRAINT "unit_faith_points" CHECK ("faith_points" >= 0)
);
--> statement-breakpoint
CREATE INDEX "temple_guardians_city_idx" ON "temple_guardians" ("city_id");--> statement-breakpoint
ALTER TABLE "temple_devotions" ADD CONSTRAINT "temple_devotions_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "temple_guardians" ADD CONSTRAINT "temple_guardians_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "temple_guardians" ADD CONSTRAINT "temple_guardians_city_id_world_cities_id_fkey" FOREIGN KEY ("city_id") REFERENCES "world_cities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "unit_faith" ADD CONSTRAINT "unit_faith_unit_id_world_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "world_units"("id") ON DELETE CASCADE;