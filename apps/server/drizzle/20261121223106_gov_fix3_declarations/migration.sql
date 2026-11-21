CREATE TABLE "diplomacy_declarations" (
	"nation_a" bigint,
	"nation_b" bigint,
	"declarer" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "diplomacy_declarations_pkey" PRIMARY KEY("nation_a","nation_b"),
	CONSTRAINT "diplomacy_declarations_order" CHECK ("nation_a" < "nation_b"),
	CONSTRAINT "diplomacy_declarations_declarer" CHECK ("declarer" = "nation_a" or "declarer" = "nation_b")
);
--> statement-breakpoint
ALTER TABLE "diplomacy_declarations" ADD CONSTRAINT "diplomacy_declarations_nation_a_factions_id_fkey" FOREIGN KEY ("nation_a") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diplomacy_declarations" ADD CONSTRAINT "diplomacy_declarations_nation_b_factions_id_fkey" FOREIGN KEY ("nation_b") REFERENCES "factions"("id") ON DELETE CASCADE;