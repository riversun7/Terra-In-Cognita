CREATE TABLE "user_nation_renown" (
	"user_id" uuid,
	"faction_id" bigint,
	"renown" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "user_nation_renown_pkey" PRIMARY KEY("user_id","faction_id"),
	CONSTRAINT "user_nation_renown_nonnegative" CHECK ("renown" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_nation_renown" ADD CONSTRAINT "user_nation_renown_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_nation_renown" ADD CONSTRAINT "user_nation_renown_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");