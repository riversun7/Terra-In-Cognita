CREATE TABLE "unit_tactics" (
	"unit_id" bigint PRIMARY KEY,
	"preset" text NOT NULL,
	"engage" smallint NOT NULL,
	"pursue" smallint NOT NULL,
	"cover" smallint NOT NULL,
	"escort" smallint NOT NULL,
	"save_skill" smallint NOT NULL,
	"spread" smallint NOT NULL,
	"retreat_pct" smallint NOT NULL,
	"target" text NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_tactics_preset" CHECK ("preset" in ('aggressive', 'balanced', 'defensive', 'hold')),
	CONSTRAINT "unit_tactics_target" CHECK ("target" in ('nearest', 'weakest', 'threat')),
	CONSTRAINT "unit_tactics_sliders" CHECK ("engage" between 0 and 10 and "pursue" between 0 and 10 and "cover" between 0 and 10 and "escort" between 0 and 10 and "save_skill" between 0 and 10 and "spread" between 0 and 10),
	CONSTRAINT "unit_tactics_retreat" CHECK ("retreat_pct" between 0 and 100)
);
