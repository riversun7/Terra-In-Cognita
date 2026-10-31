CREATE TABLE "faction_members" (
	"user_id" uuid PRIMARY KEY,
	"faction_id" bigint NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "factions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"parent_id" bigint,
	"code" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factions_kind" CHECK ("kind" in ('npc', 'player')),
	CONSTRAINT "factions_code_format" CHECK ("code" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" bigint PRIMARY KEY,
	"owner_id" bigint,
	"system_code" text UNIQUE,
	"asset" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ledger_accounts_one_kind" CHECK (num_nonnulls("owner_id", "system_code") = 1),
	CONSTRAINT "ledger_accounts_owner_nonnegative" CHECK ("system_code" is not null or "balance" >= 0),
	CONSTRAINT "ledger_accounts_asset_format" CHECK ("asset" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tx_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "ledger_entries_amount_nonzero" CHECK ("amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" bigint PRIMARY KEY,
	"kind" text NOT NULL,
	"at_ms" bigint NOT NULL,
	"idempotency_key" text UNIQUE
);
--> statement-breakpoint
CREATE TABLE "summary_acks" (
	"user_id" uuid PRIMARY KEY,
	"acked_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_buildings" (
	"id" bigint PRIMARY KEY,
	"map_key" bigint NOT NULL,
	"owner_id" bigint,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"rotation" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_exploration" (
	"user_id" uuid,
	"map_key" bigint,
	"cells" bytea NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "world_exploration_pkey" PRIMARY KEY("user_id","map_key"),
	CONSTRAINT "world_exploration_cells" CHECK (octet_length("cells") = 128)
);
--> statement-breakpoint
CREATE TABLE "world_heartbeat" (
	"id" smallint PRIMARY KEY,
	"boot_id" uuid NOT NULL,
	"alive_at_ms" bigint NOT NULL,
	CONSTRAINT "world_heartbeat_single" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "world_owners" (
	"id" bigint PRIMARY KEY,
	"user_id" uuid UNIQUE,
	"faction_id" bigint UNIQUE,
	"settled_at_ms" bigint NOT NULL,
	"upkeep_arrears" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "world_owners_one_kind" CHECK (num_nonnulls("user_id", "faction_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "world_presence" (
	"user_id" uuid PRIMARY KEY,
	"offline_since_ms" bigint,
	"updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_units" (
	"id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"kind" smallint NOT NULL,
	"size" smallint NOT NULL,
	"speed" integer NOT NULL,
	"map_key" bigint NOT NULL,
	"path" integer[] NOT NULL,
	"depart_at_ms" bigint NOT NULL,
	"wake_at_ms" bigint,
	"ai_step" integer DEFAULT 0 NOT NULL,
	"job" smallint DEFAULT 0 NOT NULL,
	"job_phase" smallint DEFAULT 0 NOT NULL,
	"job_progress_ms" integer DEFAULT 0 NOT NULL,
	"fatigue" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "world_units_size" CHECK ("size" between 1 and 3),
	CONSTRAINT "world_units_speed" CHECK ("speed" > 0),
	CONSTRAINT "world_units_path" CHECK (cardinality("path") >= 2 and cardinality("path") % 2 = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_owner_asset_idx" ON "ledger_accounts" ("owner_id","asset");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" ("tx_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" ("account_id");--> statement-breakpoint
CREATE INDEX "world_buildings_map_idx" ON "world_buildings" ("map_key");--> statement-breakpoint
CREATE INDEX "world_units_owner_idx" ON "world_units" ("owner_id");--> statement-breakpoint
CREATE INDEX "world_units_map_idx" ON "world_units" ("map_key");--> statement-breakpoint
ALTER TABLE "faction_members" ADD CONSTRAINT "faction_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "faction_members" ADD CONSTRAINT "faction_members_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_parent_id_factions_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tx_id_ledger_transactions_id_fkey" FOREIGN KEY ("tx_id") REFERENCES "ledger_transactions"("id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id");--> statement-breakpoint
ALTER TABLE "summary_acks" ADD CONSTRAINT "summary_acks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "world_exploration" ADD CONSTRAINT "world_exploration_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_owners" ADD CONSTRAINT "world_owners_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "world_owners" ADD CONSTRAINT "world_owners_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "world_presence" ADD CONSTRAINT "world_presence_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_units" ADD CONSTRAINT "world_units_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
-- 원장 거래·항목은 추가만 한다(ADR 8, docs/adr/2026-10-31-s3-server-stage.md 4절): UPDATE·DELETE·TRUNCATE를 DB가 거절한다.
-- 바로잡기는 반대 항목을 더하는 새 거래로 한다. 트리거를 지우려면 새 마이그레이션 + ADR이 필요하다.
CREATE FUNCTION "ledger_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_change"();
