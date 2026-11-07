CREATE TABLE "unit_vitals" (
	"unit_id" bigint PRIMARY KEY,
	"hp" bigint NOT NULL,
	"armor" bigint NOT NULL,
	"shield" bigint NOT NULL,
	"max_hp" bigint NOT NULL,
	"max_armor" bigint NOT NULL,
	"max_shield" bigint NOT NULL,
	"regen_hp" bigint DEFAULT 0 NOT NULL,
	"regen_armor" bigint DEFAULT 0 NOT NULL,
	"regen_shield" bigint DEFAULT 0 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_vitals_hp" CHECK ("hp" between 0 and "max_hp"),
	CONSTRAINT "unit_vitals_armor" CHECK ("armor" between 0 and "max_armor"),
	CONSTRAINT "unit_vitals_shield" CHECK ("shield" between 0 and "max_shield"),
	CONSTRAINT "unit_vitals_max" CHECK ("max_hp" >= 1 and "max_armor" >= 0 and "max_shield" >= 0),
	CONSTRAINT "unit_vitals_regen" CHECK ("regen_hp" >= 0 and "regen_armor" >= 0 and "regen_shield" >= 0)
);
