CREATE TABLE "claim_cities" (
	"city_id" bigint PRIMARY KEY,
	"founder_owner_id" bigint NOT NULL,
	"choice" text NOT NULL,
	"founded_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_facilities" ADD COLUMN "claim_choice" text;--> statement-breakpoint
ALTER TABLE "world_facilities" ADD CONSTRAINT "world_facilities_claim_choice" CHECK ("claim_choice" ~ '^(nation|independent)(:(dictatorship|democracy|capitalism))?$');