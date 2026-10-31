CREATE TABLE "world_battle_snapshots" (
	"battle_id" bigint,
	"tick" integer,
	"state" text NOT NULL,
	CONSTRAINT "world_battle_snapshots_pkey" PRIMARY KEY("battle_id","tick")
);
--> statement-breakpoint
CREATE TABLE "world_battles" (
	"id" bigint PRIMARY KEY,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"seed" bigint NOT NULL,
	"sim_version" integer NOT NULL,
	"war" boolean DEFAULT false NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"ends_at_ms" bigint NOT NULL,
	"init" jsonb NOT NULL,
	"inputs" jsonb DEFAULT '[]' NOT NULL,
	"result" jsonb,
	CONSTRAINT "world_battles_status" CHECK ("status" in ('running', 'ended'))
);
--> statement-breakpoint
CREATE INDEX "world_battles_status_idx" ON "world_battles" ("status");--> statement-breakpoint
ALTER TABLE "world_battle_snapshots" ADD CONSTRAINT "world_battle_snapshots_battle_id_world_battles_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "world_battles"("id") ON DELETE CASCADE;