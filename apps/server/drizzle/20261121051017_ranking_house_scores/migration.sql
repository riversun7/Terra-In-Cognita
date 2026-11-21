CREATE TABLE "ranking_house_scores" (
	"path_id" text,
	"npc" boolean,
	"house_id" bigint,
	"score" bigint NOT NULL,
	CONSTRAINT "ranking_house_scores_pkey" PRIMARY KEY("path_id","npc","house_id"),
	CONSTRAINT "ranking_house_scores_score" CHECK ("score" > 0),
	CONSTRAINT "ranking_house_scores_path_format" CHECK ("path_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
