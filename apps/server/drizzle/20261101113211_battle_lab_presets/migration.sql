CREATE TABLE "battle_lab_presets" (
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"name_ko" text NOT NULL,
	"name_en" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_lab_presets_id_format" CHECK ("id" ~ '^lab_[0-9a-f]{12}$'),
	CONSTRAINT "battle_lab_presets_kind" CHECK ("kind" in ('unit', 'party')),
	CONSTRAINT "battle_lab_presets_name_length" CHECK (char_length("name_ko") between 1 and 40 and char_length("name_en") between 1 and 40),
	CONSTRAINT "battle_lab_presets_version_positive" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "battle_lab_presets" ADD CONSTRAINT "battle_lab_presets_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "battle_lab_presets" ADD CONSTRAINT "battle_lab_presets_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;