CREATE TABLE "world_city_layout_requests" (
	"planet_id" text PRIMARY KEY DEFAULT 's2_test_planet',
	"requested_by" uuid,
	"requested_at_ms" bigint NOT NULL,
	"applied_at_ms" bigint,
	"report" jsonb
);
--> statement-breakpoint
ALTER TABLE "world_city_layout_requests" ADD CONSTRAINT "world_city_layout_requests_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL;