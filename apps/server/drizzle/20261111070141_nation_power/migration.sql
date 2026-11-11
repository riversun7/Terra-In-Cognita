CREATE TABLE "world_tier_requests" (
	"planet_id" text PRIMARY KEY DEFAULT 's2_test_planet',
	"requested_by" uuid,
	"requested_at_ms" bigint NOT NULL,
	"applied_at_ms" bigint,
	"report" jsonb
);
--> statement-breakpoint
ALTER TABLE "world_humans" ADD COLUMN "guard" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "world_tier_requests" ADD CONSTRAINT "world_tier_requests_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "content_overrides" DROP CONSTRAINT "content_overrides_category", ADD CONSTRAINT "content_overrides_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types', 'facilities', 'gather_tiers', 'creatures', 'nation_presets', 'nation_tiers'));--> statement-breakpoint
ALTER TABLE "content_retired_ids" DROP CONSTRAINT "content_retired_ids_category", ADD CONSTRAINT "content_retired_ids_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types', 'facilities', 'gather_tiers', 'creatures', 'nation_presets', 'nation_tiers'));