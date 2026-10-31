CREATE TABLE "planet_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"base" jsonb NOT NULL,
	"definition" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"author_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "planet_library_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "planet_library_name_length" CHECK (char_length("name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "planet_library_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planet_library_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"planet_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"bytes" integer NOT NULL,
	"saved_by" uuid,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planet_library_versions_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "planet_library_versions_bytes_nonnegative" CHECK ("bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX "planet_library_updated_idx" ON "planet_library" ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "planet_library_versions_planet_revision_idx" ON "planet_library_versions" ("planet_id","revision");--> statement-breakpoint
ALTER TABLE "planet_library" ADD CONSTRAINT "planet_library_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "planet_library" ADD CONSTRAINT "planet_library_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "planet_library" ADD CONSTRAINT "planet_library_deleted_by_users_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "planet_library_versions" ADD CONSTRAINT "planet_library_versions_planet_id_planet_library_id_fkey" FOREIGN KEY ("planet_id") REFERENCES "planet_library"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "planet_library_versions" ADD CONSTRAINT "planet_library_versions_saved_by_users_id_fkey" FOREIGN KEY ("saved_by") REFERENCES "users"("id") ON DELETE SET NULL;