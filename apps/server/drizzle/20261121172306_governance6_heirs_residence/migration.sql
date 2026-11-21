CREATE TABLE "house_heirs" (
	"faction_id" bigint PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"designated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_residences" ADD COLUMN "paused_since_ms" bigint;--> statement-breakpoint
ALTER TABLE "house_heirs" ADD CONSTRAINT "house_heirs_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_heirs" ADD CONSTRAINT "house_heirs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;