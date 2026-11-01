CREATE TABLE "content_retired_ids" (
	"category" text,
	"id" text,
	"content_version" text NOT NULL,
	"retired_by" uuid,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_retired_ids_pkey" PRIMARY KEY("category","id"),
	CONSTRAINT "content_retired_ids_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types')),
	CONSTRAINT "content_retired_ids_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "content_retired_ids" ADD CONSTRAINT "content_retired_ids_retired_by_users_id_fkey" FOREIGN KEY ("retired_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "content_overrides" DROP CONSTRAINT "content_overrides_category", ADD CONSTRAINT "content_overrides_category" CHECK ("category" in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types'));