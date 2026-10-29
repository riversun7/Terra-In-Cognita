CREATE SEQUENCE "public"."planet_draft_revision_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "planet_draft_revisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planet_draft_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"draft_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"entry" jsonb NOT NULL,
	"base" jsonb,
	"bytes" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planet_draft_revisions_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "planet_draft_revisions_bytes_nonnegative" CHECK ("bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "planet_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"planet_id" text NOT NULL,
	"revision" integer NOT NULL,
	"base" jsonb,
	"entry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planet_drafts_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "planet_drafts_revision_positive" CHECK ("revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "planet_draft_revisions_draft_revision_idx" ON "planet_draft_revisions" ("draft_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "planet_drafts_owner_planet_idx" ON "planet_drafts" ("owner_id","planet_id");--> statement-breakpoint
ALTER TABLE "planet_draft_revisions" ADD CONSTRAINT "planet_draft_revisions_draft_id_planet_drafts_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "planet_drafts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "planet_drafts" ADD CONSTRAINT "planet_drafts_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;