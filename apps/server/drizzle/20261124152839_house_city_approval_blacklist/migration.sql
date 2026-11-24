CREATE TABLE "city_house_applications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "city_house_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"city_id" bigint NOT NULL,
	"house_id" bigint NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"expires_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nation_blacklist" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nation_blacklist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nation_id" bigint NOT NULL,
	"city_id" bigint,
	"user_id" uuid NOT NULL,
	"reason" text,
	"bounty" bigint DEFAULT 0 NOT NULL,
	"renown_reward" integer DEFAULT 10 NOT NULL,
	"created_by" uuid,
	"created_at_ms" bigint NOT NULL,
	CONSTRAINT "nation_blacklist_bounty" CHECK ("bounty" >= 0),
	CONSTRAINT "nation_blacklist_renown" CHECK ("renown_reward" >= 0),
	CONSTRAINT "nation_blacklist_reason" CHECK ("reason" is null or char_length("reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "join_approver" text;--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "join_min_standing" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "city_house_applications_city_house_idx" ON "city_house_applications" ("city_id","house_id");--> statement-breakpoint
CREATE INDEX "city_house_applications_city_idx" ON "city_house_applications" ("city_id","expires_at_ms");--> statement-breakpoint
CREATE INDEX "city_house_applications_house_idx" ON "city_house_applications" ("house_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nation_blacklist_nation_user_idx" ON "nation_blacklist" ("nation_id","user_id");--> statement-breakpoint
CREATE INDEX "nation_blacklist_user_idx" ON "nation_blacklist" ("user_id");--> statement-breakpoint
ALTER TABLE "city_house_applications" ADD CONSTRAINT "city_house_applications_house_id_factions_id_fkey" FOREIGN KEY ("house_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "city_house_applications" ADD CONSTRAINT "city_house_applications_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nation_blacklist" ADD CONSTRAINT "nation_blacklist_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nation_blacklist" ADD CONSTRAINT "nation_blacklist_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nation_blacklist" ADD CONSTRAINT "nation_blacklist_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;