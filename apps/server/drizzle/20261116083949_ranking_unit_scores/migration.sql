CREATE TABLE "ranking_unit_scores" (
	"path_id" text,
	"unit_id" bigint,
	"score" bigint NOT NULL,
	CONSTRAINT "ranking_unit_scores_pkey" PRIMARY KEY("path_id","unit_id"),
	CONSTRAINT "ranking_unit_scores_score" CHECK ("score" > 0),
	CONSTRAINT "ranking_unit_scores_path_format" CHECK ("path_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE INDEX "ranking_unit_scores_unit_idx" ON "ranking_unit_scores" ("unit_id");