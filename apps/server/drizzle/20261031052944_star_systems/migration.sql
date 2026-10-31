CREATE TABLE "star_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"author_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "star_systems_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "star_systems_name_length" CHECK (char_length("name") between 1 and 60)
);
--> statement-breakpoint
CREATE INDEX "star_systems_updated_idx" ON "star_systems" ("updated_at");--> statement-breakpoint
ALTER TABLE "star_systems" ADD CONSTRAINT "star_systems_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "star_systems" ADD CONSTRAINT "star_systems_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "star_systems" ADD CONSTRAINT "star_systems_deleted_by_users_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL;