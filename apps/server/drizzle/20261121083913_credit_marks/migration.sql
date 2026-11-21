CREATE TABLE "credit_marks" (
	"cause" text PRIMARY KEY,
	"kind" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"unit_id" bigint,
	"city_id" bigint NOT NULL,
	"nation_id" bigint NOT NULL,
	"city_points" integer NOT NULL,
	"nation_points" integer NOT NULL,
	"count" integer NOT NULL,
	"since_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "credit_marks_kind" CHECK ("kind" in ('resident', 'business')),
	CONSTRAINT "credit_marks_points" CHECK ("city_points" >= 0 and "nation_points" >= 0 and "count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "credit_marks_owner_idx" ON "credit_marks" ("owner_id");