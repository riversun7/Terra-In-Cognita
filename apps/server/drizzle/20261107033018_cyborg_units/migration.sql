CREATE TABLE "cyborg_units" (
	"unit_id" bigint PRIMARY KEY,
	"level" smallint DEFAULT 1 NOT NULL,
	"stats" smallint[] NOT NULL,
	"elements" smallint[],
	"human_stats" smallint[] NOT NULL,
	"donor" text NOT NULL,
	"bonus_pm" integer NOT NULL,
	"fused_at_ms" bigint NOT NULL,
	CONSTRAINT "cyborg_units_level" CHECK ("level" >= 1),
	CONSTRAINT "cyborg_units_stats" CHECK (cardinality("stats") = 6 and 0 <= all("stats")),
	CONSTRAINT "cyborg_units_human_stats" CHECK (cardinality("human_stats") = 6),
	CONSTRAINT "cyborg_units_elements" CHECK ("elements" is null or (cardinality("elements") = 12 and 0 <= all("elements") and 10 >= all("elements"))),
	CONSTRAINT "cyborg_units_donor" CHECK ("donor" in ('parts', 'android')),
	CONSTRAINT "cyborg_units_bonus" CHECK ("bonus_pm" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cyborg_units" ADD CONSTRAINT "cyborg_units_unit_id_world_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "world_units"("id") ON DELETE CASCADE;