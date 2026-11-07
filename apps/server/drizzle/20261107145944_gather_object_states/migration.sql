CREATE TABLE "gather_object_states" (
	"planet_id" text DEFAULT 's2_test_planet',
	"map_key" bigint,
	"object_id" integer,
	"uses_left" integer NOT NULL,
	"regrow_at_ms" bigint NOT NULL,
	CONSTRAINT "gather_object_states_pkey" PRIMARY KEY("planet_id","map_key","object_id"),
	CONSTRAINT "gather_object_states_object" CHECK ("object_id" between 0 and 65535),
	CONSTRAINT "gather_object_states_uses" CHECK ("uses_left" >= 0),
	CONSTRAINT "gather_object_states_regrow" CHECK ("regrow_at_ms" >= 0)
);
