CREATE TABLE "ranking_worth" (
	"kind" smallint,
	"subject_id" bigint,
	"combat_power" bigint NOT NULL,
	"assets" bigint NOT NULL,
	CONSTRAINT "ranking_worth_pkey" PRIMARY KEY("kind","subject_id"),
	CONSTRAINT "ranking_worth_kind" CHECK ("kind" in (0, 1)),
	CONSTRAINT "ranking_worth_values" CHECK ("combat_power" >= 0 and "assets" >= 0)
);
