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
      "pace",
      "depart_at_ms",
      // 움직임 속도(운영자 배율 등)와 그 움직임의 출발 시각 짝(secondMapRows.ts unitColumnsOf)
      "motion_speed",
      "motion_depart_at_ms",
      "wake_at_ms",
      "ai_step",
      "job",
      "job_phase",
      "job_progress_ms",
      "fatigue",
      "injury",
      "injury_until_ms",
      "injury_heal_pm",
      "held_by",
      // 타고 있는 배(docs/adr/2026-11-13-boats.md 4절)
      "aboard_id",
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
  /** 유닛 단위 가문(기획 D-569 1744 — 고용한 사람의 가문, world/houseTies.ts). 주인이 그 가문을 떠나면 지운다 */
  houseUnits: {
    name: "house_units",
    columns: ["unit_id", "faction_id", "user_id", "set_at_ms"],
    key: ["unit_id"],
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
      "look",
      "look_auto",
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
  /** 국적 바꾸기 기록(추가만, docs/adr/2026-11-08-citizenship.md) — 사이보그 행·세력 가입·원장 거래와 같은 커밋 */
  nationalityChanges: {
    name: "nationality_changes",
    columns: [
      "user_id",
      "from_faction",
      "to_faction",
      "city_id",
      "building_id",
      "at_ms",
      "fee",
      "grant_returned",
      "grant_paid",
      "standing_drop",
      "hostile",
    ],
    key: [],
  },
  /** 사람·나라 우호도(D-526, 덮어쓰기) — 국적 바꾸기와 같은 커밋 */
  userNationStandings: {
    name: "user_nation_standings",
    columns: ["user_id", "faction_id", "score", "updated_at_ms"],
    key: ["user_id", "faction_id"],
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
  /**
   * 도시 이름만 고친다(복원된 도시가 무너지기 전 이름을 되찾을 때 — 기획 답 552 다). 도시 행(cities)은 이름 칸을 쓰지 않는다(켤 때 붙인
   * 이름을 덮지 않게)
   */
  cityNames: {
    name: "world_cities",
    columns: ["id", "name"],
    key: ["id"],
    updateOnly: true,
  },
  /**
   * NPC 도시의 시장·처음 인구를 채운 시각만 고친다(docs/adr/2026-11-07-play-flow.md "WP-NPC2", npc/cityPeople.ts). 도시 행(cities)은 이 칸을
   * 쓰지 않는다(직전 판 앱이 도시 행을 써도 시장이 지워지지 않게)
   */
  cityPeople: {
    name: "world_cities",
    columns: ["id", "mayor_unit_id", "population_seeded_at_ms"],
    key: ["id"],
    updateOnly: true,
  },
  /**
   * NPC 도시의 하루 생필품 충족 ‰만 고친다(기획 정리 781 나, docs/adr/2026-11-07-play-flow.md "WP-NPC4", npc/cityDayStore.ts). 도시 행(cities)은
   * 이 칸을 쓰지 않는다(직전 판 앱이 도시 행을 써도 지워지지 않게)
   */
  cityDay: {
    name: "world_cities",
    columns: ["id", "necessities_pm"],
    key: ["id"],
    updateOnly: true,
  },
  /** 도시의 지난 하루 끝 배후지 다툼 결과만 고친다(질문 1061 나, npc/catchmentStore.ts — cityDay와 같은 까닭으로 따로) */
  cityCatchment: {
    name: "world_cities",
    columns: ["id", "catchment"],
    key: ["id"],
    updateOnly: true,
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
  /** 휴먼 성장 K만 고친다(신전 환생 어드밴티지 D-520). humans 행은 이 칸을 쓰지 않는다(다른 쓰기가 덮지 않게) */
  humanGrowth: {
    name: "world_humans",
    columns: ["unit_id", "k_pm"],
    key: ["unit_id"],
    updateOnly: true,
  },
  /**
   * 휴먼의 경비대 표시만 고친다(국력 등급 씨앗 — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"). humans 행은 이 칸을 쓰지 않는다
   * (유저 휴먼을 쓰는 다른 곳이 이 칸을 몰라도 된다). 휴먼 행 다음에 쓴다
   */
  humanGuard: {
    name: "world_humans",
    columns: ["unit_id", "guard"],
    key: ["unit_id"],
    updateOnly: true,
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
  /** 수호신(D-311·기획 답 456 가, 바탕 유닛 ID 열쇠 — 소유 주체·도시 다음에 쓴다) */
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
      "buff",
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
      "born_of",
    ],
    key: ["id"],
    updateOnly: true,
  },
  /**
   * 플레이어 가문 세력 상태(docs/adr/2026-11-11-house-village.md): 거울 세계가 바꾸는 칸만(체제·봉신 위 세력·기술·성향). 이름 코드·사라짐·
   * 태어날 때 부모는 쓰지 않는다(가문 행은 가문 명령이 고친다 — 해산·귀화 따라가기 follow.ts)
   */
  houseFactionState: {
    name: "factions",
    columns: [
      "id",
      "regime",
      "parent_id",
      "tech_level",
      "tech_blueprint",
      "research_progress",
      "traits",
      "ai_step",
    ],
    key: ["id"],
    updateOnly: true,
  },
  /**
   * NPC 수도(D-528, src/npc/capitals.ts)만 고친다. 세력 상태(factionState)는 이 칸을 쓰지 않는다(직전 판 앱이 세력 행을 써도 수도가 지워지지 않게)
   */
  factionCapital: {
    name: "factions",
    columns: ["id", "capital_city_id"],
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
  /** 배후지 칸 재고(질문 1061 나, npc/catchmentStore.ts). 상한으로 돌아온 칸은 지운다 */
  catchmentStock: {
    name: "catchment_cell_stock",
    columns: ["planet_id", "cell_key", "ore", "wood", "herb", "crop", "livestock", "fish", "updated_at_ms"],
    key: ["planet_id", "cell_key"],
  },
  /** 가문 도시 자동 구인 스위치만 고친다(질문 1041 다, factionIdentity/houseCity.ts) */
  houseRecruitAuto: {
    name: "factions",
    columns: ["id", "recruit_auto"],
    key: ["id"],
    updateOnly: true,
  },
  /** 원자재 오브젝트 남은 번수·다시 자라는 시각(docs/adr/2026-11-07-gather-objects.md) — 채집 거래와 같은 커밋 */
  gatherObjects: {
    name: "gather_object_states",
    columns: ["planet_id", "map_key", "object_id", "uses_left", "regrow_at_ms"],
    key: ["planet_id", "map_key", "object_id"],
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
      "deadline_ms",
      "name",
    ],
    key: ["id"],
  },
  restorationContributions: {
    name: "restoration_contributions",
    columns: ["ruin_id", "owner_id", "amount"],
    key: ["ruin_id", "owner_id"],
  },
  /** 공성 결과(docs/adr/2026-11-07-war-outcomes.md): 한 줄 = 결과 하나, 남은 상태(끝·다음 세금·거둔 세금)를 고친다 */
  warOutcomes: {
    name: "war_outcomes",
    columns: [
      "id",
      "city_id",
      "attacker_faction_id",
      "target_faction_id",
      "outcome",
      "share_choice",
      "at_ms",
      "until_ms",
      "next_tax_ms",
      "ended_at_ms",
      "taken",
      "taken_asset",
      "end_reason",
    ],
    key: ["id"],
  },
  /** 공성 결과 줄의 남은 상태만 고친다(점령 상태의 다음 세금·거둔 세금·약탈이 꺼내 간 금고 몫) */
  warOutcomeState: {
    name: "war_outcomes",
    columns: ["id", "next_tax_ms", "taken"],
    key: ["id"],
    updateOnly: true,
  },
  /** 공성 결과 줄의 끝난 시각·까닭만 고친다(남은 상태가 끝남, 까닭은 D-527) */
  warOutcomeEnds: {
    name: "war_outcomes",
    columns: ["id", "ended_at_ms", "end_reason"],
    key: ["id"],
    updateOnly: true,
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
      "packed",
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
  /** 유닛 직무(직무 배치·채집 진행, docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산") — 산출 거래와 같은 묶음 */
  unitWork: {
    name: "unit_work",
    columns: [
      "unit_id",
      "owner_id",
      "building_id",
      "assigned_at_ms",
      "gather_building_id",
      "gather_points",
      "gather_seq",
      "updated_at_ms",
    ],
    key: ["unit_id"],
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
      "seeded",
      "plots",
      "gather_tier",
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
  /** 거래소 개인 창고 넓힌 칸(기획 D-571 1943 — 도시 × 주인, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)") */
  exchangeLockers: {
    name: "exchange_lockers",
    columns: ["city_id", "owner_id", "steps", "updated_at_ms"],
    key: ["city_id", "owner_id"],
  },
  /** 물자 거래소(docs/adr/2026-11-07-play-flow.md WP4): 도시 × 물건 거래소 ID(에스크로 계정 열쇠) */
  marketBooks: {
    name: "market_books",
    columns: ["id", "city_id", "item", "created_at_ms", "currency"],
    key: ["id"],
  },
  /** 거래소 주문(걸 때·체결·취소·만료마다 — 에스크로·체결 거래와 같은 묶음). NPC 세력 주문은 끝나면 지운다 */
  marketOrders: {
    name: "market_orders",
    columns: [
      "id",
      "market_id",
      "owner_id",
      "side",
      "price",
      "qty",
      "remaining",
      "locked",
      "seq",
      "placed_at_ms",
      "expires_at_ms",
      "state",
      "done_at_ms",
    ],
    key: ["id"],
  },
  /** 체결 한 건(추가만) */
  marketTrades: {
    name: "market_trades",
    columns: [
      "id",
      "market_id",
      "price",
      "qty",
      "taker_side",
      "maker_order_id",
      "taker_order_id",
      "maker_owner_id",
      "taker_owner_id",
      "at_ms",
      "currency",
    ],
    key: [],
  },
  /** 환전 짝(화폐마다 하나, ID = 에스크로 열쇠 — docs/adr/2026-11-07-play-flow.md WP6) */
  fxPairs: {
    name: "fx_pairs",
    columns: ["id", "currency", "created_at_ms"],
    key: ["id"],
  },
  /** 환전 주문(낼 때·거둘 때·회차가 끝날 때 — 에스크로·회차 정산 거래와 같은 묶음). NPC 세력 주문은 회차가 끝나면 지운다 */
  fxOrders: {
    name: "fx_orders",
    columns: [
      "id",
      "pair_id",
      "owner_id",
      "side",
      "price",
      "lots",
      "locked",
      "seq",
      "placed_at_ms",
      "state",
      "filled_lots",
      "clear_price",
      "done_at_ms",
    ],
    key: ["id"],
  },
  /** 환전 회차 결과(추가만) */
  fxRounds: {
    name: "fx_rounds",
    columns: ["id", "pair_id", "at_ms", "price", "lots"],
    key: [],
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
  /** 2차맵 사이 이동(docs/adr/2026-11-07-play-flow.md WP9·WP11) — 2차맵을 넘을 때 유닛 행과 같은 커밋 */
  travels: {
    name: "world_travels",
    columns: [
      "unit_id",
      "owner_id",
      "planet_id",
      "kind",
      "route",
      "leg",
      "target_x",
      "target_y",
      "started_at_ms",
      "arrive_at_ms",
      "user_id",
      "origin_map_key",
      "origin_x",
      "origin_y",
      "scouted_map_key",
      "hidden_until_ms",
    ],
    key: ["unit_id"],
  },
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
  /** 배 만들기 작업(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)") — 재료 빼기와 같은 커밋, 배가 뜨면 지운다 */
  boatJobs: {
    name: "boat_jobs",
    columns: [
      "id",
      "owner_id",
      "building_id",
      "planet_id",
      "materials",
      "started_at_ms",
      "done_at_ms",
      "kind",
      "type_id",
      "boat_id",
    ],
    key: ["id"],
  },
  /** 배 상태(종류·내구도·집 정박장·정박료·교역 부두 — docs/adr/2026-11-15-shipyard-harbor.md). 배가 없어지면 지운다 */
  boatStates: {
    name: "boat_states",
    columns: [
      "boat_id",
      "planet_id",
      "type_id",
      "hull_ppm",
      "hull_at_ms",
      "home_id",
      "fee_paid_to_ms",
      "arrears",
      "trade_id",
      "trade_until_ms",
      "trade_charged_to_ms",
      // D-559: 도크·연료·오버히트·보직
      "owner_id",
      "yard_id",
      "yard_since_ms",
      "yard_map_key",
      "yard_x",
      "yard_y",
      "fuel_milli",
      "fuel_at_ms",
      "overheat",
      "cool_until_ms",
      "crew",
    ],
    key: ["boat_id"],
  },
  /** 배 시설 주인 설정(받기 범위·요금·조선소 모듈) */
  boatFacilities: {
    name: "boat_facilities",
    columns: ["building_id", "planet_id", "access", "fee", "module", "modules"],
    key: ["building_id"],
  },
  /** 사업장 상태(적자·멈춤·자동 정산 주기 — docs/adr/2026-11-15-business-ledger.md). 건물이 사라지면 지운다 */
  businessStates: {
    name: "business_states",
    columns: ["building_id", "planet_id", "debt_since_ms", "suspended_at_ms", "settled_at_ms", "reserve_pm"],
    key: ["building_id"],
  },
  /** 사업장 창고 판매 값(D-555 1507) */
  businessPrices: {
    name: "business_prices",
    columns: ["building_id", "item", "planet_id", "price"],
    key: ["building_id", "item"],
  },
  /** 생산시설 지분 주문(docs/adr/2026-11-15-building-screen.md — open·done·cancelled) */
  businessShareOrders: {
    name: "business_share_orders",
    columns: [
      "id",
      "building_id",
      "planet_id",
      "owner_id",
      "side",
      "price",
      "shares",
      "locked",
      "seq",
      "placed_at_ms",
      "state",
      "filled",
      "clear_price",
      "done_at_ms",
    ],
    key: ["id"],
  },
  /** 생산시설 지분 동시호가 회차(추가만) */
  businessShareRounds: {
    name: "business_share_rounds",
    columns: ["id", "building_id", "planet_id", "at_ms", "price", "shares"],
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
  "factionState",
  "houseFactionState",
  "accounts",
  "cities",
  "factionCapital",
  "cityNames",
  "units",
  "travels",
  "humans",
  "cityPeople",
  "cityDay",
  "cityCatchment",
  "humanGrowth",
  "humanGuard",
  "cyborgUnits",
  "unitSkills",
  "unitFaith",
  "templeDevotions",
  "templeGuardians",
  "recruitDraws",
  "factionWars",
  "npcSociety",
  "pollution",
  "catchmentStock",
  "houseRecruitAuto",
  "gatherObjects",
  "gardenerWaves",
  "ruins",
  "restorationContributions",
  "warOutcomes",
  "warOutcomeState",
  "warOutcomeEnds",
  "beacons",
  "buildings",
  "presence",
  "exploration",
  "heartbeat",
  "factionMembers",
  "houseUnits",
  "cyborgs",
  "nationalityChanges",
  "userNationStandings",
  "cyborgRolls",
  "holdings",
  "unitEffects",
  "unitCooldowns",
  "vitals",
  "laborContracts",
  "laborPostings",
  "laborRents",
  "unitWork",
  "facilities",
  "facilityJobs",
  "boatJobs",
  "boatStates",
  "boatFacilities",
  "businessStates",
  "businessPrices",
  "businessShareOrders",
  "businessShareRounds",
  "marketBooks",
  "marketOrders",
  "marketTrades",
  "exchangeLockers",
  "fxPairs",
  "fxOrders",
  "fxRounds",
  "transactions",
  "entries",
  "battleResults",
];

/** 한 행: 열 이름 → 값(number·string·bigint·null·정수 배열·Buffer) */
export type Row = Readonly<Record<string, unknown>>;
