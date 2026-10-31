CREATE TABLE "second_map_pins" (
	"planet_id" text,
	"map_key" bigint,
	"terrain_version" text NOT NULL,
	"tctr_gzip" bytea NOT NULL,
	"pinned_at_ms" bigint NOT NULL,
	CONSTRAINT "second_map_pins_pkey" PRIMARY KEY("planet_id","map_key"),
	CONSTRAINT "second_map_pins_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "second_map_pins_size" CHECK (octet_length("tctr_gzip") between 32 and 4194304)
);
