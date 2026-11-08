CREATE TABLE "ops_grants" (
	"user_id" uuid PRIMARY KEY,
	"permissions" text[] NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ops_grants_size" CHECK (cardinality("permissions") <= 64)
);
--> statement-breakpoint
ALTER TABLE "ops_grants" ADD CONSTRAINT "ops_grants_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;