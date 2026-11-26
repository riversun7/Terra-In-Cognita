CREATE TABLE "unit_exp" (
	"unit_id" bigint PRIMARY KEY,
	"exp" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_exp_nonnegative" CHECK ("exp" >= 0)
);
