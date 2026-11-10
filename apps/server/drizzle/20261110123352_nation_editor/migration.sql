CREATE TABLE "nation_emblems" (
	"preset_id" text PRIMARY KEY,
	"png" bytea NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nation_emblems_preset_format" CHECK ("preset_id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "nation_emblems_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "nation_emblems_bytes" CHECK ("bytes" > 0 and "bytes" <= 200000)
);
--> statement-breakpoint
CREATE INDEX "nation_emblems_sha256" ON "nation_emblems" ("sha256");--> statement-breakpoint
ALTER TABLE "nation_emblems" ADD CONSTRAINT "nation_emblems_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "content_overrides" DROP CONSTRAINT "content_overrides_category", ADD CONSTRAINT "content_overrides_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types', 'facilities', 'gather_tiers', 'creatures', 'nation_presets'));--> statement-breakpoint
ALTER TABLE "content_retired_ids" DROP CONSTRAINT "content_retired_ids_category", ADD CONSTRAINT "content_retired_ids_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types', 'facilities', 'gather_tiers', 'creatures', 'nation_presets'));