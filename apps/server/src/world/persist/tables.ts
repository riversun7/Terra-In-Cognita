// 월드 쓰기 대기열이 쓰는 표(열 이름은 src/db/schema.ts와 같다) — docs/adr/2026-10-31-s3-server-stage.md 1절
// 쓰는 차례가 곧 외래 키 차례다: 소유 주체 → 계정 → 유닛·건물 → … → 거래 → 항목. 지우기는 거꾸로 한다.

export interface TableSpec {
  readonly name: string;
  readonly columns: readonly string[];
  /** 같은 행을 가리키는 열(바뀜을 하나로 합칠 때·ON CONFLICT). 추가만 하는 표는 비운다 */
  readonly key: readonly string[];
  /** 있는 행을 고치기만 한다(UPDATE … WHERE 열쇠). 정체 열(identity)이라 upsert를 쓸 수 없는 표(factions) */
  readonly updateOnly?: boolean;
}

export const WORLD_TABLES = {
  owners: {
    name: "world_owners",
    columns: ["id", "user_id", "faction_id", "settled_at_ms", "upkeep_arrears", "upkeep_unpaid_at_ms"],
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
  /** 세력 가입(사용자당 한 줄). joined_at은 처음 넣을 때 DB 기본값 */
  factionMembers: {
    name: "faction_members",
    columns: ["user_id", "faction_id"],
    key: ["user_id"],
  },
  /** 사이보그(계정당 하나, docs/adr/2026-11-01-first-login-cyborg.md 2절) — 만들 때 유닛과 같은 커밋 */
  cyborgs: {
    name: "cyborgs",
    columns: [
      "user_id",
      "name",
      "name_key",
      "temperament",
      "initial",
      "k_pm",
      "appearance",
      "faction_id",
      "start_city_id",
      "unit_id",
      "level",
      "exp",
      "rebirths",
      "faith",
      "created_at_ms",
      "elements",
      "religion",
      "faith_points",
      "start_grant",
    ],
    key: ["user_id"],
  },
  /** 만드는 중인 초기 스탯 굴림(만들면 지운다) */
  cyborgRolls: {
    name: "cyborg_rolls",
    columns: ["user_id", "temperament", "stats", "rolls_used", "seed", "updated_at_ms"],
    key: ["user_id"],
  },
  /** 도시(docs/adr/2026-11-01-npc-brain-r5.md 7절: NPC 사회 런타임이 주인·주거·연구 시설·발전도를 고치고 새 마을을 넣는다) */
  cities: {
    name: "world_cities",
    columns: [
      "id",
      "faction_id",
      "planet_id",
      "map_key",
      "cell_x",
      "cell_y",
      "start",
      "housing",
      "research_level",
      "founded_at_ms",
      "development",
      "next_rebellion_ms",
      "wave_cooldown_until_ms",
      "admin_level",
    ],
    key: ["id"],
  },
  /** 휴먼(유닛 하나 = 휴먼 하나: NPC 나라의 시험 봇·유저가 고용한 휴먼). 유닛 다음에 쓰고 유닛보다 먼저 지운다 */
  humans: {
    name: "world_humans",
    columns: [
      "unit_id",
      "city_id",
      "satisfaction_milli",
      "born_at_ms",
      "lifespan_ms",
      "rebirths",
      "level",
      "stats",
      "elements",
    ],
    key: ["unit_id"],
  },
  /** 사이보그 유닛(D-470 융합, 유닛 하나 = 한 줄). 유닛 다음에 쓰고 유닛보다 먼저 지운다 */
  cyborgUnits: {
    name: "cyborg_units",
    columns: ["unit_id", "level", "stats", "elements", "human_stats", "donor", "bonus_pm", "fused_at_ms"],
    key: ["unit_id"],
  },
  /** 유닛이 배운 스킬(스킬 유전자 주입 D-516, 유닛·스킬마다 한 줄). 유닛 다음에 쓰고, 유닛이 지워지면 DB가 함께 지운다 */
  unitSkills: {
    name: "unit_skills",
    columns: ["unit_id", "skill_id", "grade", "source", "learned_at_ms"],
    key: ["unit_id", "skill_id"],
  },
  /** 유닛 신앙(D-451, 유저 휴먼): 유닛 다음에 쓰고, 유닛이 지워지면 DB가 함께 지운다(docs/adr/2026-11-07-temple-religion.md) */
  unitFaith: {
    name: "unit_faith",
    columns: ["unit_id", "faith", "faith_points"],
    key: ["unit_id"],
  },
  /** 기도 쿨다운(소유 주체마다 마지막 기도 시각, 소유 주체 다음에 쓴다) */
  templeDevotions: {
    name: "temple_devotions",
    columns: ["owner_id", "last_prayed_at_ms"],
    key: ["owner_id"],
  },
  /** 수호신 기록(D-311, 바탕 유닛 ID 열쇠 — 소유 주체·도시 다음에 쓴다) */
  templeGuardians: {
    name: "temple_guardians",
    columns: [
      "unit_id",
      "owner_id",
      "city_id",
      "temple_id",
      "level",
      "rebirths",
      "stats",
      "elements",
      "faith",
      "deified_at_ms",
    ],
    key: ["unit_id"],
  },
  /** 구인 카드 산 칸(D-469): 고용 주체 × 도시마다 한 줄(소유 주체·도시 다음에 쓴다) */
  recruitDraws: {
    name: "recruit_draws",
    columns: ["owner_id", "city_id", "window_index", "taken"],
    key: ["owner_id", "city_id"],
  },
  /** 세력 상태(고치기만: 새 세력 행은 정체 열이라 런타임이 DB에 먼저 넣는다) */
  factionState: {
    name: "factions",
    columns: [
      "id",
      "code",
      "regime",
      "parent_id",
      "tech_level",
      "tech_blueprint",
      "research_progress",
      "traits",
      "ai_step",
      "dissolved_at_ms",
      "rebel_of",
    ],
    key: ["id"],
    updateOnly: true,
  },
  /** 세력 쌍의 전쟁·불가침(작은 ID가 앞) */
  factionWars: {
    name: "faction_wars",
    columns: ["faction_a", "faction_b", "state", "at_ms"],
    key: ["faction_a", "faction_b"],
  },
  /** NPC 사회 런타임 상태(한 줄, gardener = 정원사 상태 jsonb) */
  npcSociety: {
    name: "npc_society",
    columns: ["id", "seed", "day", "updated_at_ms", "gardener"],
    key: ["id"],
  },
  /** 1차맵 칸 오염(docs/adr/2026-11-01-gardener-r5b.md). 0이 된 칸은 지운다 */
  pollution: {
    name: "planet_pollution",
    columns: ["planet_id", "cell_key", "value", "updated_at_ms"],
    key: ["planet_id", "cell_key"],
  },
  /** 정원사 도시 웨이브·보호 레이드(예고부터 결과까지 한 줄). reward는 JSON 글자로 넣는다 */
  gardenerWaves: {
    name: "gardener_waves",
    columns: [
      "id",
      "planet_id",
      "city_id",
      "cell_key",
      "faction_id",
      "strength",
      "physical",
      "created_at_ms",
      "arrive_at_ms",
      "state",
      "battle_id",
      "resolved_at_ms",
      "kind",
      "reward",
    ],
    key: ["id"],
  },
  /** 폐허·복원 사업(docs/adr/2026-11-07-ruins-restoration.md): 폐허 한 줄 + 낸 값(폐허 × 소유 주체). 복원하면 폐허 줄을 지운다 */
  ruins: {
    name: "world_ruins",
    columns: [
      "id",
      "planet_id",
      "map_key",
      "cell_x",
      "cell_y",
      "former_faction_id",
      "ruined_at_ms",
      "housing",
      "claimant_owner_id",
      "join_faction_id",
      "claimed_at_ms",
      "government_building_id",
      "goal",
      "currency",
      "open",
    ],
    key: ["id"],
  },
  restorationContributions: {
    name: "restoration_contributions",
    columns: ["ruin_id", "owner_id", "amount"],
    key: ["ruin_id", "owner_id"],
  },
  /**
   * 보유 물건(아이템 인스턴스, docs/adr/2026-11-03-item-holdings.md 2절). stats·gene(유전자 값 D-516)은 JSON 글자로 넣는다(pg가 배열을
   * Postgres 배열로 바꾸지 않게)
   */
  holdings: {
    name: "item_holdings",
    columns: [
      "id",
      "owner_id",
      "item_id",
      "location",
      "slot",
      "quantity",
      "stats",
      "score_pm",
      "durability",
      "max_durability",
      "aged_ms",
      "aged_at_ms",
      "created_at_ms",
      "source",
      "gene",
    ],
    key: ["id"],
  },
  /** 유닛에 걸린 효과(소모품 사용 D-501, 끝난 줄은 지운다) */
  unitEffects: {
    name: "unit_effects",
    columns: ["unit_id", "effect_id", "value", "until_ms", "exclusive", "item_id"],
    key: ["unit_id", "effect_id"],
  },
  /** 유닛 쓰기 쿨(물약 D-509, 끝난 줄은 지운다) */
  unitCooldowns: {
    name: "unit_cooldowns",
    columns: ["unit_id", "kind", "until_ms"],
    key: ["unit_id", "kind"],
  },
  /** 유닛 생명 수치(D-512: HP·아머·쉴드가 전투 뒤에도 남는다, 전투 결과·전투 밖 회복약과 같은 묶음). 가득이면 줄을 지운다 */
  vitals: {
    name: "unit_vitals",
    columns: [
      "unit_id",
      "hp",
      "armor",
      "shield",
      "max_hp",
      "max_armor",
      "max_shield",
      "regen_hp",
      "regen_armor",
      "regen_shield",
      "updated_at_ms",
    ],
    key: ["unit_id"],
  },
  /** 노동 계약(docs/adr/2026-11-03-labor-contracts.md) — 보증금·임금·임대료 거래와 같은 묶음 */
  laborContracts: {
    name: "labor_contracts",
    columns: [
      "id",
      "kind",
      "owner_id",
      "worker_owner_id",
      "unit_id",
      "building_id",
      "asset",
      "rate",
      "deposit",
      "started_at_ms",
      "ends_at_ms",
      "settled_at_ms",
      "next_due_ms",
      "state",
      "grace_until_ms",
      "ended_at_ms",
      "end_reason",
      "paid_total",
      "leftovers_moved_at_ms",
    ],
    key: ["id"],
  },
  /** 구인 게시(남의 유닛을 임금형으로, 기획 338~342). 받기는 계약·보증금 거래와 같은 묶음 */
  laborPostings: {
    name: "labor_postings",
    columns: [
      "id",
      "building_id",
      "owner_id",
      "job",
      "asset",
      "adjust_pm",
      "slots",
      "filled",
      "term_hours",
      "state",
      "posted_at_ms",
      "closed_at_ms",
    ],
    key: ["id"],
  },
  /** 시설 임대 조건(건물마다 시간당 임대료) */
  laborRents: {
    name: "labor_rents",
    columns: ["building_id", "owner_id", "asset", "rent_per_hour", "updated_at_ms"],
    key: ["building_id"],
  },
  /** 건물(시설) 상태(docs/adr/2026-11-07-buildings-runtime.md) — 짓기·수리 재료 거래와 같은 묶음 */
  facilities: {
    name: "world_facilities",
    columns: [
      "building_id",
      "facility_id",
      "level",
      "condition_ppm",
      "condition_at_ms",
      "built_at_ms",
      "built_by",
      "city_id",
    ],
    key: ["building_id"],
  },
  /** 시간이 걸리는 건물 작업(짓기·레벨업·수리·장비 수리, 끝나면 지운다). materials는 JSON 글자로 넣는다 */
  facilityJobs: {
    name: "facility_jobs",
    columns: [
      "id",
      "kind",
      "owner_id",
      "building_id",
      "beacon_id",
      "holding_id",
      "target_level",
      "restore_ppm",
      "unit_ids",
      "materials",
      "started_at_ms",
      "done_at_ms",
    ],
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
  /** 영토 비콘(docs/adr/2026-11-03-territory-layer.md). 놓기·치우기는 영토 서비스가 넣고 커밋 뒤 답한다 */
  beacons: {
    name: "territory_beacons",
    columns: [
      "id",
      "planet_id",
      "cell_key",
      "faction_id",
      "city_id",
      "durability",
      "built_at_ms",
      "built_by",
      "condition_ppm",
      "condition_at_ms",
      "ready_at_ms",
    ],
    key: ["id"],
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
  "factionState",
  "accounts",
  "cities",
  "units",
  "humans",
  "cyborgUnits",
  "unitSkills",
  "unitFaith",
  "templeDevotions",
  "templeGuardians",
  "recruitDraws",
  "factionWars",
  "npcSociety",
  "pollution",
  "gardenerWaves",
  "ruins",
  "restorationContributions",
  "beacons",
  "buildings",
  "presence",
  "exploration",
  "heartbeat",
  "factionMembers",
  "cyborgs",
  "cyborgRolls",
  "holdings",
  "unitEffects",
  "unitCooldowns",
  "vitals",
  "laborContracts",
  "laborPostings",
  "laborRents",
  "facilities",
  "facilityJobs",
  "transactions",
  "entries",
  "battleResults",
];

/** 한 행: 열 이름 → 값(number·string·bigint·null·정수 배열·Buffer) */
export type Row = Readonly<Record<string, unknown>>;
