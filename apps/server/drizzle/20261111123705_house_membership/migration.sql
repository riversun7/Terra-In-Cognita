CREATE TABLE "house_notices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "house_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"faction_id" bigint,
	"kind" text NOT NULL,
	"house_name" text NOT NULL,
	"other_name" text,
	"reason" text,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at_ms" bigint NOT NULL,
	CONSTRAINT "house_notices_reason" CHECK (char_length("reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE "house_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "house_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"faction_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"expires_at_ms" bigint NOT NULL,
	CONSTRAINT "house_requests_kind" CHECK ("kind" in ('invite', 'apply'))
);
--> statement-breakpoint
CREATE INDEX "house_notices_user_idx" ON "house_notices" ("user_id","created_at_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "house_requests_pair_idx" ON "house_requests" ("faction_id","user_id");--> statement-breakpoint
CREATE INDEX "house_requests_user_idx" ON "house_requests" ("user_id");--> statement-breakpoint
CREATE INDEX "house_requests_expires_idx" ON "house_requests" ("expires_at_ms");--> statement-breakpoint
ALTER TABLE "house_notices" ADD CONSTRAINT "house_notices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_notices" ADD CONSTRAINT "house_notices_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "house_requests" ADD CONSTRAINT "house_requests_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_requests" ADD CONSTRAINT "house_requests_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_requests" ADD CONSTRAINT "house_requests_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;