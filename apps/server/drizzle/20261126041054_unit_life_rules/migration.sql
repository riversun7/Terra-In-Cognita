CREATE TABLE "unit_life_rules" (
	"unit_id" bigint PRIMARY KEY,
	"rest_at" smallint NOT NULL,
	"resume_at" smallint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_life_rules_range" CHECK ("rest_at" between 1 and 120 and "resume_at" >= 0 and "resume_at" < "rest_at")
);
