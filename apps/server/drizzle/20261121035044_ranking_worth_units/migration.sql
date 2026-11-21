ALTER TABLE "ranking_worth" ADD COLUMN "owner_id" bigint;--> statement-breakpoint
ALTER TABLE "ranking_worth" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "ranking_worth" DROP CONSTRAINT "ranking_worth_kind", ADD CONSTRAINT "ranking_worth_kind" CHECK ("kind" in (0, 1, 2, 3));