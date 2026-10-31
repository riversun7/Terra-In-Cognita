// 월드 쓰기 대기열이 쓰는 표(열 이름은 src/db/schema.ts와 같다) — docs/adr/2026-10-31-s3-server-stage.md 1절
// 쓰는 차례가 곧 외래 키 차례다: 소유 주체 → 계정 → 유닛·건물 → … → 거래 → 항목. 지우기는 거꾸로 한다.

export interface TableSpec {
  readonly name: string;
  readonly columns: readonly string[];
  /** 같은 행을 가리키는 열(바뀜을 하나로 합칠 때·ON CONFLICT). 추가만 하는 표는 비운다 */
  readonly key: readonly string[];
}

export const WORLD_TABLES = {
  owners: {
    name: "world_owners",
    columns: ["id", "user_id", "faction_id", "settled_at_ms", "upkeep_arrears"],
    key: ["id"],
  },
  accounts: {
    name: "ledger_accounts",
    columns: ["id", "owner_id", "system_code", "asset", "location", "balance"],
    key: ["id"],
  },
  units: {
    name: "world_units",
    columns: [
      "id",
      "owner_id",
      "kind",
      "size",
      "speed",
      "map_key",
      "planet_id",
      "domain",
      "path",
      "depart_at_ms",
      "wake_at_ms",
      "ai_step",
      "job",
      "job_phase",
      "job_progress_ms",
      "fatigue",
      "injury",
      "injury_until_ms",
      "held_by",
    ],
    key: ["id"],
  },
  buildings: {
    name: "world_buildings",
    columns: ["id", "map_key", "planet_id", "domain", "owner_id", "x", "y", "width", "height", "rotation"],
    key: ["id"],
  },
  presence: {
    name: "world_presence",
    columns: ["user_id", "offline_since_ms", "updated_at_ms"],
    key: ["user_id"],
  },
  exploration: {
    name: "world_exploration",
    columns: ["user_id", "map_key", "planet_id", "cells", "updated_at_ms"],
    // 기본 키가 아직 (user_id, map_key)다(schema.ts worldExploration 주석). 행성이 둘이 되기 전에 planet_id를 더한다
    key: ["user_id", "map_key"],
  },
  heartbeat: {
    name: "world_heartbeat",
    columns: ["id", "boot_id", "alive_at_ms"],
    key: ["id"],
  },
  transactions: {
    name: "ledger_transactions",
    columns: ["id", "kind", "at_ms", "idempotency_key"],
    key: [],
  },
  entries: {
    name: "ledger_entries",
    columns: ["tx_id", "account_id", "amount"],
    key: [],
  },
  /** 전투 결과 적용 기록(추가만, 전투마다 한 줄 — 유닛 바뀜·탈취 거래와 같은 묶음) */
  battleResults: {
    name: "world_battle_results",
    columns: ["battle_id", "applied_at_ms", "result"],
    key: [],
  },
} as const satisfies Record<string, TableSpec>;

export type WorldTable = keyof typeof WORLD_TABLES;

/** 쓰는 차례(외래 키). 지우기는 이 차례를 거꾸로 */
export const WRITE_ORDER: readonly WorldTable[] = [
  "owners",
  "accounts",
  "units",
  "buildings",
  "presence",
  "exploration",
  "heartbeat",
  "transactions",
  "entries",
  "battleResults",
];

/** 한 행: 열 이름 → 값(number·string·bigint·null·정수 배열·Buffer) */
export type Row = Readonly<Record<string, unknown>>;
