ALTER TABLE "world_facilities" ADD COLUMN "access_scope" text;--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "foreign_build" boolean;--> statement-breakpoint
ALTER TABLE "world_facilities" ADD CONSTRAINT "world_facilities_access_scope" CHECK ("access_scope" is null or "access_scope" in ('anyone', 'city_resident', 'city_house', 'nation_citizen'));