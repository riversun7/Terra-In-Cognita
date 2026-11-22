CREATE TABLE "unit_commutes" (
	"unit_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"building_id" bigint NOT NULL,
	"from_ms" bigint NOT NULL,
	"until_ms" bigint NOT NULL,
	CONSTRAINT "unit_commutes_span" CHECK ("until_ms" > "from_ms")
);
