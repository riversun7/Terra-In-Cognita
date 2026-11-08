CREATE TABLE "nationality_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nationality_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"from_faction" bigint NOT NULL,
	"to_faction" bigint NOT NULL,
	"city_id" bigint NOT NULL,
	"building_id" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	"fee" bigint NOT NULL,
	"grant_returned" bigint NOT NULL,
	CONSTRAINT "nationality_changes_amounts" CHECK ("fee" >= 0 and "grant_returned" >= 0),
	CONSTRAINT "nationality_changes_other_nation" CHECK ("from_faction" <> "to_faction")
);
--> statement-breakpoint
CREATE INDEX "nationality_changes_user_idx" ON "nationality_changes" ("user_id","at_ms");--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD CONSTRAINT "nationality_changes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD CONSTRAINT "nationality_changes_from_faction_factions_id_fkey" FOREIGN KEY ("from_faction") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD CONSTRAINT "nationality_changes_to_faction_factions_id_fkey" FOREIGN KEY ("to_faction") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "nationality_changes" ADD CONSTRAINT "nationality_changes_city_id_world_cities_id_fkey" FOREIGN KEY ("city_id") REFERENCES "world_cities"("id");