CREATE TABLE "battle_reports" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"mode" text NOT NULL,
	"runs" integer NOT NULL,
	"seed" integer NOT NULL,
	"variant" boolean NOT NULL,
	"score_pm" integer NOT NULL,
	"score_b_pm" integer,
	"content_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"sim_version" integer NOT NULL,
	"tuning_revision" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"input" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_reports_id_format" CHECK ("id" ~ '^rep_[0-9a-f]{12}$'),
	CONSTRAINT "battle_reports_mode" CHECK ("mode" in ('arena', 'siege', 'wave')),
	CONSTRAINT "battle_reports_name_length" CHECK (char_length("name") between 1 and 60),
	CONSTRAINT "battle_reports_note_length" CHECK (char_length("note") <= 400),
	CONSTRAINT "battle_reports_runs_positive" CHECK ("runs" >= 1)
);
--> statement-breakpoint
CREATE INDEX "battle_reports_created_idx" ON "battle_reports" ("created_at");--> statement-breakpoint
ALTER TABLE "battle_reports" ADD CONSTRAINT "battle_reports_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;