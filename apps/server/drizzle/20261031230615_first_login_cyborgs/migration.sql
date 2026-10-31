CREATE TABLE "cyborg_rolls" (
	"user_id" uuid PRIMARY KEY,
	"temperament" text NOT NULL,
	"stats" smallint[] NOT NULL,
	"rolls_used" smallint NOT NULL,
	"seed" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "cyborg_rolls_six" CHECK (cardinality("stats") = 6),
	CONSTRAINT "cyborg_rolls_used" CHECK ("rolls_used" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cyborgs" (
	"user_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"name_key" text NOT NULL UNIQUE,
	"temperament" text NOT NULL,
	"initial" smallint[] NOT NULL,
	"k_pm" smallint[] NOT NULL,
	"appearance" jsonb NOT NULL,
	"faction_id" bigint NOT NULL,
	"start_city_id" bigint NOT NULL,
	"unit_id" bigint,
	"level" smallint DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"rebirths" smallint DEFAULT 0 NOT NULL,
	"faith" smallint DEFAULT 0 NOT NULL,
	"created_at_ms" bigint NOT NULL,
	CONSTRAINT "cyborgs_initial_six" CHECK (cardinality("initial") = 6),
	CONSTRAINT "cyborgs_k_six" CHECK (cardinality("k_pm") = 6),
	CONSTRAINT "cyborgs_temperament_format" CHECK ("temperament" ~ '^[a-z][a-z0-9_]{1,31}$'),
	CONSTRAINT "cyborgs_level" CHECK ("level" >= 1 and "exp" >= 0 and "rebirths" >= 0),
	CONSTRAINT "cyborgs_faith" CHECK ("faith" between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cyborgs_unit_idx" ON "cyborgs" ("unit_id");--> statement-breakpoint
ALTER TABLE "cyborg_rolls" ADD CONSTRAINT "cyborg_rolls_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "cyborgs" ADD CONSTRAINT "cyborgs_start_city_id_world_cities_id_fkey" FOREIGN KEY ("start_city_id") REFERENCES "world_cities"("id");