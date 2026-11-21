ALTER TABLE "world_units" ADD COLUMN "traits" smallint[];--> statement-breakpoint
ALTER TABLE "npc_houses" ADD COLUMN "traits_override" smallint[];--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_traits" CHECK ("traits" is null or (cardinality("traits") = 7 and 0 <= all("traits") and 1000 >= all("traits")));--> statement-breakpoint
ALTER TABLE "npc_houses" ADD CONSTRAINT "npc_houses_traits_override" CHECK ("traits_override" is null or (cardinality("traits_override") = 7 and 0 <= all("traits_override") and 1000 >= all("traits_override")));