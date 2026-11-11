CREATE TABLE "house_members" (
	"user_id" uuid PRIMARY KEY,
	"faction_id" bigint NOT NULL,
	"role" text NOT NULL,
	"joined_at_ms" bigint NOT NULL,
	CONSTRAINT "house_members_role" CHECK ("role" in ('leader', 'member'))
);
--> statement-breakpoint
CREATE TABLE "house_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "house_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"faction_id" bigint NOT NULL,
	"reporter_id" uuid NOT NULL,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faction_identities" ADD COLUMN "faction_id" bigint;--> statement-breakpoint
ALTER TABLE "faction_identities" ADD COLUMN "founded_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "faction_identities" ADD COLUMN "takedown_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "faction_identities" ADD CONSTRAINT "faction_identities_faction_id_key" UNIQUE("faction_id");--> statement-breakpoint
CREATE INDEX "house_members_faction_idx" ON "house_members" ("faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "house_reports_once_idx" ON "house_reports" ("faction_id","reporter_id");--> statement-breakpoint
CREATE INDEX "house_reports_reporter_idx" ON "house_reports" ("reporter_id","created_at_ms");--> statement-breakpoint
ALTER TABLE "faction_identities" ADD CONSTRAINT "faction_identities_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_reports" ADD CONSTRAINT "house_reports_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_reports" ADD CONSTRAINT "house_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "faction_profiles" DROP CONSTRAINT "faction_profiles_source", ADD CONSTRAINT "faction_profiles_source" CHECK ("source" in ('preset', 'default', 'admin', 'player'));