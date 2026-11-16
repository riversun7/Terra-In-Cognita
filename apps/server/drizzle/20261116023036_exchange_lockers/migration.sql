CREATE TABLE "exchange_lockers" (
	"city_id" bigint,
	"owner_id" bigint,
	"steps" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "exchange_lockers_pkey" PRIMARY KEY("city_id","owner_id"),
	CONSTRAINT "exchange_lockers_steps" CHECK ("steps" >= 0)
);
--> statement-breakpoint
ALTER TABLE "exchange_lockers" ADD CONSTRAINT "exchange_lockers_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");