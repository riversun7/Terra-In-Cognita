CREATE TABLE "recruit_draws" (
	"owner_id" bigint,
	"city_id" bigint,
	"window_index" bigint NOT NULL,
	"taken" integer NOT NULL,
	CONSTRAINT "recruit_draws_pkey" PRIMARY KEY("owner_id","city_id"),
	CONSTRAINT "recruit_draws_taken" CHECK ("taken" >= 0)
);
--> statement-breakpoint
ALTER TABLE "world_cities" ADD COLUMN "admin_level" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_humans" ADD COLUMN "level" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_humans" ADD COLUMN "stats" smallint[];--> statement-breakpoint
ALTER TABLE "world_humans" ADD COLUMN "elements" smallint[];--> statement-breakpoint
ALTER TABLE "recruit_draws" ADD CONSTRAINT "recruit_draws_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "recruit_draws" ADD CONSTRAINT "recruit_draws_city_id_world_cities_id_fkey" FOREIGN KEY ("city_id") REFERENCES "world_cities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_cities" ADD CONSTRAINT "world_cities_admin_level" CHECK ("admin_level" between 1 and 5);--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_level" CHECK ("level" >= 1);--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_stats" CHECK ("stats" is null or cardinality("stats") = 6);--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_elements" CHECK ("elements" is null or (cardinality("elements") = 12 and 0 <= all("elements") and 10 >= all("elements")));