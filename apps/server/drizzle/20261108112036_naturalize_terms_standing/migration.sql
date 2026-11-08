CREATE TABLE "user_nation_standings" (
	"user_id" uuid,
	"faction_id" bigint,
	"score" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "user_nation_standings_pkey" PRIMARY KEY("user_id","faction_id"),
	CONSTRAINT "user_nation_standings_score" CHECK ("score" between -100 and 100)
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "naturalize_fee" bigint;--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD COLUMN "grant_paid" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD COLUMN "standing_drop" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD COLUMN "hostile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_nation_standings" ADD CONSTRAINT "user_nation_standings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_nation_standings" ADD CONSTRAINT "user_nation_standings_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD CONSTRAINT "nationality_changes_d526" CHECK ("grant_paid" >= 0 and "standing_drop" >= 0);