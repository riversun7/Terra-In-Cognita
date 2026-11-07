CREATE TABLE "ranking_faction_scores" (
	"faction_id" bigint PRIMARY KEY,
	"score" bigint NOT NULL,
	"rank" integer NOT NULL,
	"prev_rank" integer,
	"tier_pm" smallint,
	"cities" integer NOT NULL,
	"humans" integer NOT NULL,
	"renown" bigint,
	CONSTRAINT "ranking_faction_scores_score" CHECK ("score" > 0 and "rank" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ranking_path_scores" (
	"path_id" text,
	"owner_id" bigint,
	"score" bigint NOT NULL,
	"gain" bigint NOT NULL,
	"rank" integer NOT NULL,
	"prev_rank" integer,
	"tier_pm" smallint,
	CONSTRAINT "ranking_path_scores_pkey" PRIMARY KEY("path_id","owner_id"),
	CONSTRAINT "ranking_path_scores_score" CHECK ("score" > 0 and "gain" >= 0 and "rank" >= 1),
	CONSTRAINT "ranking_path_scores_path_format" CHECK ("path_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE TABLE "ranking_state" (
	"id" smallint PRIMARY KEY,
	"period_from_ms" bigint NOT NULL,
	"period_to_ms" bigint NOT NULL,
	"computed_at_ms" bigint NOT NULL,
	CONSTRAINT "ranking_state_single" CHECK ("id" = 1),
	CONSTRAINT "ranking_state_period" CHECK ("period_to_ms" > "period_from_ms")
);
--> statement-breakpoint
CREATE INDEX "ranking_faction_scores_rank_idx" ON "ranking_faction_scores" ("rank");--> statement-breakpoint
CREATE INDEX "ranking_path_scores_rank_idx" ON "ranking_path_scores" ("path_id","rank");