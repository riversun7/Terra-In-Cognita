CREATE TABLE "unit_stats" (
	"unit_id" bigint PRIMARY KEY,
	"level" integer NOT NULL,
	"stats" smallint[] NOT NULL,
	"elements" smallint[],
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_stats_six" CHECK (cardinality("stats") = 6),
	CONSTRAINT "unit_stats_level" CHECK ("level" >= 1)
);
