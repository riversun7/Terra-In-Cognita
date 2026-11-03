CREATE TABLE "item_holdings" (
	"id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"item_id" text NOT NULL,
	"location" bigint NOT NULL,
	"slot" smallint,
	"quantity" integer DEFAULT 1 NOT NULL,
	"stats" jsonb,
	"score_pm" smallint,
	"durability" integer,
	"max_durability" integer,
	"aged_ms" bigint,
	"aged_at_ms" bigint,
	"created_at_ms" bigint NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "item_holdings_item_format" CHECK ("item_id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "item_holdings_source_format" CHECK ("source" ~ '^[a-z][a-z0-9_]{1,31}$'),
	CONSTRAINT "item_holdings_location" CHECK ("location" <> 0),
	CONSTRAINT "item_holdings_slot" CHECK ("slot" is null or ("slot" >= 0 and "location" < 0)),
	CONSTRAINT "item_holdings_quantity" CHECK ("quantity" >= 1),
	CONSTRAINT "item_holdings_score" CHECK ("score_pm" is null or "score_pm" between 0 and 1000),
	CONSTRAINT "item_holdings_durability" CHECK (("durability" is null and "max_durability" is null) or ("durability" between 0 and "max_durability")),
	CONSTRAINT "item_holdings_age" CHECK (("aged_ms" is null) = ("aged_at_ms" is null))
);
--> statement-breakpoint
CREATE TABLE "unit_cooldowns" (
	"unit_id" bigint,
	"kind" text,
	"until_ms" bigint NOT NULL,
	CONSTRAINT "unit_cooldowns_pkey" PRIMARY KEY("unit_id","kind"),
	CONSTRAINT "unit_cooldowns_kind" CHECK ("kind" in ('potion', 'food'))
);
--> statement-breakpoint
CREATE TABLE "unit_effects" (
	"unit_id" bigint,
	"effect_id" text,
	"value" integer NOT NULL,
	"until_ms" bigint NOT NULL,
	"exclusive" text,
	"item_id" text NOT NULL,
	CONSTRAINT "unit_effects_pkey" PRIMARY KEY("unit_id","effect_id"),
	CONSTRAINT "unit_effects_effect_format" CHECK ("effect_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE INDEX "item_holdings_owner_idx" ON "item_holdings" ("owner_id");--> statement-breakpoint
CREATE INDEX "item_holdings_location_idx" ON "item_holdings" ("location");--> statement-breakpoint
ALTER TABLE "item_holdings" ADD CONSTRAINT "item_holdings_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");